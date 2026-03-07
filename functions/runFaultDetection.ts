import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const now = new Date();
    const localDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const localHour = localDate.getHours();
    const localMinute = localDate.getMinutes();
    const minutesSinceMidnight = localHour * 60 + localMinute;
    const dateKey = localDate.toISOString().slice(0, 10);

    const log = [];
    const triggered = [];

    const faultTypes = await db.entities.FaultType.list();
    const activeFaultTypes = faultTypes.filter(ft => ft.is_active);

    if (activeFaultTypes.length === 0) {
      return Response.json({ message: 'No active fault types.', log });
    }

    // Check if current hour is within the fault type's active check window
    function isWithinCheckHours(ft) {
      const from = ft.check_hour_from ?? (ft.check_only_during_daylight ? 6 : 0);
      const to = ft.check_hour_to ?? (ft.check_only_during_daylight ? 20 : 24);
      return localHour >= from && localHour < to;
    }

    // Load all data in parallel
    const [sites, inverters, openAlerts, allSnapshots] = await Promise.all([
      db.entities.Site.list(),
      db.entities.Inverter.list(),
      db.entities.Alert.filter({ is_resolved: false }),
      db.entities.SiteGraphSnapshot.list() // all historical snapshots for LLM context
    ]);

    // Map snapshots by station_id -> date_key -> data (last 20 days)
    const snapshotsByStation = {};
    const twentyDaysAgo = new Date(localDate);
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
    for (const snap of allSnapshots) {
      if (snap.date_key < twentyDaysAgo.toISOString().slice(0, 10)) continue;
      if (!snapshotsByStation[snap.station_id]) snapshotsByStation[snap.station_id] = {};
      snapshotsByStation[snap.station_id][snap.date_key] = snap.data || [];
    }

    // Compute daily yield (kWh) from snapshot data array (5-min intervals)
    function computeDailyYield(data) {
      if (!data || data.length < 2) return 0;
      return data.reduce((sum, p) => sum + (p.value || 0) * (5 / 60), 0);
    }

    // Compute expected specific yield (kWh/kWp) from last 20 active days for a site
    function computeExpectedSpecificYield(stationSnapshots, todayKey, dcKwp) {
      if (!dcKwp || dcKwp <= 0) return null;
      const sortedDates = Object.keys(stationSnapshots).filter(d => d !== todayKey).sort().reverse();
      const activeDays = [];
      for (const d of sortedDates) {
        const dayData = stationSnapshots[d];
        const yield_kwh = computeDailyYield(dayData);
        if (yield_kwh > 0.5) { // at least 0.5 kWh to count as active day
          activeDays.push(yield_kwh);
        }
        if (activeDays.length >= 20) break;
      }
      if (activeDays.length < 20) return null; // not enough data - cannot evaluate
      const avgDailyKwh = activeDays.reduce((a, b) => a + b, 0) / activeDays.length;
      return avgDailyKwh / dcKwp; // kWh per kWp per day
    }

    // Expected power fraction (bell curve) - still used for time-of-day normalization
    function getExpectedPowerFraction(min) {
      const sunrise = 360, sunset = 1170;
      if (min <= sunrise || min >= sunset) return 0;
      return Math.sin(((min - sunrise) / (sunset - sunrise)) * Math.PI);
    }
    const expectedFraction = getExpectedPowerFraction(minutesSinceMidnight);

    // Volatility index from graph data
    function computeVolatilityIndex(data) {
      if (!data || data.length < 5) return 0;
      const daytime = data.filter(d => d.value > 0.5);
      if (daytime.length < 5) return 0;
      const values = daytime.map(d => d.value);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      if (avg < 1) return 0;
      let reversals = 0, prevDir = 0;
      for (let i = 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        const dir = diff > 0.3 ? 1 : diff < -0.3 ? -1 : 0;
        if (dir !== 0 && prevDir !== 0 && dir !== prevDir) reversals++;
        if (dir !== 0) prevDir = dir;
      }
      const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
      const cvPercent = (Math.sqrt(variance) / avg) * 100;
      return Math.round(Math.min(100, (reversals / (values.length - 1)) * 200) * 0.6 + Math.min(100, cvPercent * 2) * 0.4);
    }

    // Detect recurring "comb" production drop pattern (fan/temperature derating fault)
    // Fan fault pattern: power drops to a CONSISTENT level (~50-70% of peak), stays there
    // for 2-3 data points (10-15 min), then recovers fully. Repeats multiple times per day.
    // The key differentiator from clouds: all drops land at the SAME value (derating level).
    // Cloud pattern: drops to RANDOM different values each time.
    function countRectangularDropDays(stationSnapshots, todayKey) {
      const sortedDates = Object.keys(stationSnapshots).filter(d => d !== todayKey).sort().reverse().slice(0, 20);
      let daysWithRectDrops = 0;
      for (const d of sortedDates) {
        const dayData = stationSnapshots[d] || [];
        const daytime = dayData.filter(p => p.value > 0.5);
        if (daytime.length < 10) continue;
        const values = daytime.map(p => p.value);
        const peak = Math.max(...values);
        if (peak < 2) continue;

        // Find all drop events: high -> low -> recovery
        const dropEvents = [];
        let i = 0;
        while (i < values.length) {
          // Look for a drop: current point is high (>70% peak), next point drops to <65% peak
          if (values[i] > peak * 0.70 && i + 1 < values.length && values[i + 1] < peak * 0.65) {
            const lowStart = i + 1;
            let j = lowStart;
            // Collect consecutive low points
            while (j < values.length && values[j] < peak * 0.65) j++;
            const lowDuration = j - lowStart;
            const lowValues = values.slice(lowStart, j);
            const avgLow = lowValues.reduce((a, b) => a + b, 0) / lowValues.length;
            const hasRecovery = j < values.length && values[j] > peak * 0.65;
            
            // "Comb" drop = stays low for 2+ points AND recovers
            if (lowDuration >= 2 && hasRecovery) {
              // Check consistency of low values (std dev should be small relative to avg)
              const lowStd = Math.sqrt(lowValues.reduce((s, v) => s + Math.pow(v - avgLow, 2), 0) / lowValues.length);
              const isConsistent = lowStd < avgLow * 0.15; // low values within 15% of each other
              dropEvents.push({ avgLow, duration: lowDuration, consistent: isConsistent });
            }
            i = j;
          } else {
            i++;
          }
        }

        // Need at least 2 drop events to be a "comb" pattern
        if (dropEvents.length < 2) continue;

        // Key check: do the drops land at a SIMILAR level? (derating = same value each time)
        // vs clouds where each drop goes to a different random level
        const consistentDrops = dropEvents.filter(e => e.consistent);
        if (consistentDrops.length < 2) continue;

        // Check if the average low values across drops are close to each other
        const avgLows = consistentDrops.map(e => e.avgLow);
        const meanOfLows = avgLows.reduce((a, b) => a + b, 0) / avgLows.length;
        const stdOfLows = Math.sqrt(avgLows.reduce((s, v) => s + Math.pow(v - meanOfLows, 2), 0) / avgLows.length);
        
        // If the spread of drop levels is small (<20% of mean), they're landing at the same
        // derating level = fan fault pattern. Clouds would have much higher spread.
        if (stdOfLows < meanOfLows * 0.20 && consistentDrops.length >= 2) {
          daysWithRectDrops++;
        }
      }
      return daysWithRectDrops;
    }

    // Rule-based evaluation (for fault types WITH detection_rules)
    function evaluateRules(ft, site, siteInverters, volatility, stationSnapshots) {
      if (!ft.detection_rules || ft.detection_rules.length === 0) return null; // no rules
      const expectedSpecificYield = computeExpectedSpecificYield(stationSnapshots, dateKey, site.dc_capacity_kwp);
      const cyclicDropDays = countRectangularDropDays(stationSnapshots, dateKey);
      const ruleResults = ft.detection_rules.map(rule => evaluateRule(rule, site, siteInverters, expectedFraction, volatility, expectedSpecificYield, cyclicDropDays));
      const logic = ft.detection_logic || 'all';
      let triggered = logic === 'any' ? ruleResults.some(r => r) : ruleResults.every(r => r);

      // Special logic for phase voltage faults: 
      // If ALL 3 phase rules are triggered (all phases down), it's NOT a "missing phase" fault
      // - it's a different issue (total disconnect / no data). Only flag if 1-2 phases are down.
      if (triggered && ft.alert_type === 'phase_voltage_out_of_range') {
        const phaseRules = ft.detection_rules.filter(r => 
          r.metric === 'phase_voltage_l1' || r.metric === 'phase_voltage_l2' || r.metric === 'phase_voltage_l3'
        );
        if (phaseRules.length === 3) {
          const phaseResults = phaseRules.map(rule => 
            evaluateRule(rule, site, siteInverters, expectedFraction, volatility, expectedSpecificYield, cyclicDropDays)
          );
          const phasesDown = phaseResults.filter(r => r).length;
          // Also check: if inverters have no data at all (all voltages null/0), skip
          const hasAnyVoltageData = siteInverters.some(inv => {
            const pv = inv.phase_voltages;
            return pv && (pv.l1 > 0 || pv.l2 > 0 || pv.l3 > 0);
          });
          if (phasesDown === 3 || !hasAnyVoltageData) {
            triggered = false; // All 3 down or no data = different fault, not missing phase
          }
        }
      }

      return triggered;
    }

    // LLM-based evaluation (for fault types WITH detection_notes or reference_images)
    async function evaluateWithLLM(ft, site, siteInverters, stationSnapshots, volatility) {
      if (!ft.detection_notes && (!ft.reference_images || ft.reference_images.length === 0)) return null;

      // Build multi-day graph summary (last 20 days)
      const sortedDates = Object.keys(stationSnapshots).sort();
      const todayData = stationSnapshots[dateKey] || [];

      // Today's full graph
      const todayGraphSummary = todayData.length > 0
        ? `גרף היום (${dateKey}): ${todayData.map(d => `${d.time}=${d.value}kW`).join(', ')}`
        : `גרף היום (${dateKey}): אין נתונים`;

      // Historical: daily total yield per day (last 20 days)
      const historicalSummary = sortedDates
        .filter(d => d !== dateKey)
        .map(d => {
          const dayData = stationSnapshots[d] || [];
          const totalKwh = dayData.reduce((sum, p) => sum + (p.value || 0) * (5 / 60), 0); // assuming 5-min intervals
          const maxKw = dayData.length > 0 ? Math.max(...dayData.map(p => p.value || 0)) : 0;
          // Check for drops/flatlines within the day
          const daytime = dayData.filter(p => p.value > 0.5);
          let drops = 0;
          for (let i = 1; i < daytime.length; i++) {
            if (daytime[i - 1].value > 1 && daytime[i].value < daytime[i - 1].value * 0.4) drops++;
          }
          return `${d}: סה"כ ~${totalKwh.toFixed(1)} kWh, שיא ${maxKw.toFixed(1)} kW${drops > 0 ? `, ${drops} ירידות חדות` : ''}`;
        })
        .join('\n');

      const siteContext = {
        site_name: site.name,
        dc_capacity_kwp: site.dc_capacity_kwp,
        current_power_kw: site.current_power_kw,
        daily_yield_kwh: site.daily_yield_kwh,
        current_efficiency: site.current_efficiency,
        status: site.status,
        last_heartbeat: site.last_heartbeat,
        volatility_index_today: volatility
      };

      const inverterContext = siteInverters.map(inv => ({
        name: inv.name,
        status: inv.status,
        temperature_c: inv.temperature_c,
        current_ac_power_kw: inv.current_ac_power_kw,
        daily_yield_kwh: inv.daily_yield_kwh,
        efficiency_percent: inv.efficiency_percent,
        phase_voltages: inv.phase_voltages,
        mppt_strings: inv.mppt_strings
      }));

      const hasRefImages = ft.reference_images && ft.reference_images.length > 0;
      const imageInstruction = hasRefImages
        ? `\n\n📸 מצורפות תמונות לדוגמה של איך תקלה "${ft.name}" נראית בגרף. השתמש בתמונות כדי להבין את הדפוס הוויזואלי של התקלה, והשווה אותו לנתוני הגרף שלהלן.`
        : '';

      const prompt = `אתה מומחה לניטור מערכות סולאריות.

⚠️ חשוב מאוד: תפקידך הוא לבדוק האם התקלה הספציפית "${ft.name}" קיימת לפי ההגדרה שניתנה. אל תמציא תקלות אחרות, אל תאבחן בעיות שלא ביקשו, ורק ענה true אם יש עדות ברורה לפי הקריטריונים שלהלן.
${imageInstruction}

הוראות זיהוי התקלה "${ft.name}":
${ft.detection_notes || 'אין הוראות טקסט - השתמש בתמונות הלדוגמה המצורפות כדי להבין את דפוס התקלה'}

נתוני האתר כרגע (${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}):
${JSON.stringify(siteContext, null, 2)}

נתוני אינוורטרים:
${JSON.stringify(inverterContext, null, 2)}

היסטוריית ייצור 20 ימים אחרונים:
${historicalSummary || 'אין נתונים היסטוריים'}

${todayGraphSummary}

מדד תנודתיות הספק היומי (0=יציב, 100=תנודתי מאוד): ${volatility}

שאלה: האם יש סימנים לתקלה "${ft.name}" באתר זה לפי ההוראות והתמונות שניתנו? התייחס גם להיסטוריה של 20 הימים האחרונים וגם לגרף היום המלא.
ענה אך ורק במבנה JSON: {"fault_detected": true/false, "reason": "הסבר קצר בעברית"}`;

      try {
        const llmParams = {
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              fault_detected: { type: 'boolean' },
              reason: { type: 'string' }
            },
            required: ['fault_detected', 'reason']
          }
        };
        // Attach reference images if available so LLM can visually compare patterns
        if (hasRefImages) {
          llmParams.file_urls = ft.reference_images;
        }
        const result = await db.integrations.Core.InvokeLLM(llmParams);
        return result;
      } catch (llmErr) {
        log.push(`[${ft.name}] LLM error for ${site.name}: ${llmErr.message}`);
        return null;
      }
    }

    for (const ft of activeFaultTypes) {
      if (!isWithinCheckHours(ft)) {
        const from = ft.check_hour_from ?? 6;
        const to = ft.check_hour_to ?? 20;
        log.push(`[${ft.name}] Skipped - outside check hours (${from}:00-${to}:00, current: ${localHour}:${String(localMinute).padStart(2,'0')})`);
        continue;
      }

      const hasRules = ft.detection_rules && ft.detection_rules.length > 0;
      const hasImages = ft.reference_images && ft.reference_images.length > 0;
      const hasNotes = !!(ft.detection_notes && ft.detection_notes.trim());

      if (!hasRules && !hasNotes && !hasImages) {
        log.push(`[${ft.name}] Skipped - no detection rules, notes, or reference images defined`);
        continue;
      }

      for (const site of sites) {
        const siteInverters = inverters.filter(inv => inv.site_id === site.id);
        const stationSnapshots = site.solis_station_id ? (snapshotsByStation[site.solis_station_id] || {}) : {};
        const graphData = stationSnapshots[dateKey] || null; // today's data
        const volatility = computeVolatilityIndex(graphData);

        let faultDetected = false;
        let faultReason = '';

        if (hasRules) {
          // Rule-based check first
          const ruleResult = evaluateRules(ft, site, siteInverters, volatility, stationSnapshots);
          if (ruleResult !== null) {
            faultDetected = ruleResult;
            if (faultDetected) {
              // Build detailed reason based on fault type
              const reasons = [];
              if (ft.alert_type === 'inverter_fault') {
                // Fan fault - show comb pattern info
                const temps = siteInverters.map(i => i.temperature_c).filter(v => v != null);
                const maxTemp = temps.length ? Math.max(...temps) : null;
                if (maxTemp !== null && maxTemp > 60) reasons.push(`טמפרטורה ${maxTemp}°C`);
                if (volatility > 50) reasons.push(`תנודתיות ${volatility}`);
                // cyclicDropDays already computed inside evaluateRules, recompute here for reason text
                const cyclicDays = countRectangularDropDays(stationSnapshots, dateKey);
                if (cyclicDays >= 7) reasons.push(`${cyclicDays} ימים עם דפוס מסרק (derating) מ-20 אחרונים`);
              } else if (ft.alert_type === 'phase_voltage_out_of_range') {
                // Phase fault - show which phases are down
                const pv = siteInverters.map(i => i.phase_voltages).filter(p => p);
                if (pv.length > 0) {
                  const avgL1 = pv.reduce((s, p) => s + (p.l1 || 0), 0) / pv.length;
                  const avgL2 = pv.reduce((s, p) => s + (p.l2 || 0), 0) / pv.length;
                  const avgL3 = pv.reduce((s, p) => s + (p.l3 || 0), 0) / pv.length;
                  const downPhases = [];
                  if (avgL1 < 150) downPhases.push(`L1: ${avgL1.toFixed(0)}V`);
                  if (avgL2 < 150) downPhases.push(`L2: ${avgL2.toFixed(0)}V`);
                  if (avgL3 < 150) downPhases.push(`L3: ${avgL3.toFixed(0)}V`);
                  if (downPhases.length > 0) reasons.push(`פאזות חסרות: ${downPhases.join(', ')}`);
                }
              }
              faultReason = reasons.length > 0 ? reasons.join(', ') : 'זוהה לפי חוקי זיהוי';
            }
          }
        }

        // LLM check: only run if this fault type has NO rules (pure LLM detection)
        // If it has rules AND the rules didn't trigger, skip LLM to avoid timeout
        if ((hasNotes || hasImages) && !hasRules && !faultDetected) {
          // For pure LLM fault types: only check sites with some anomaly signal
          // (volatility > 30 or efficiency < 80) to avoid running LLM on all 80+ sites
          const hasAnomaly = volatility > 30 || (site.current_efficiency ?? 100) < 80 || (site.current_power_kw ?? 0) < 0.1;
          if (hasAnomaly) {
            const llmResult = await evaluateWithLLM(ft, site, siteInverters, stationSnapshots, volatility);
            if (llmResult !== null) {
              if (llmResult.fault_detected) {
                faultDetected = true;
                faultReason = llmResult.reason;
              }
              log.push(`[${ft.name}] LLM for ${site.name}: ${llmResult.fault_detected ? 'FAULT' : 'OK'} - ${llmResult.reason}`);
            }
          } else {
            log.push(`[${ft.name}] LLM skipped for ${site.name} - no anomaly signal`);
          }
        }

        const existingAlert = openAlerts.find(a =>
          a.site_id === site.id &&
          a.type === ft.alert_type &&
          a.fault_type_name === ft.name &&
          !a.is_resolved
        );

        if (faultDetected) {
          triggered.push({ fault_type: ft.name, site_name: site.name, site_id: site.id, severity: ft.severity });
          log.push(`[${ft.name}] DETECTED on site: ${site.name}`);

          if (!existingAlert) {
            const message = faultReason || ft.description || ft.name;
            await db.entities.Alert.create({
              site_id: site.id,
              site_name: site.name,
              type: ft.alert_type,
              severity: ft.severity,
              message,
              fault_type_name: ft.name,
              is_resolved: false
            });
            log.push(`[${ft.name}] Alert created for site: ${site.name} - ${message}`);

            if (ft.notify_email) {
              try {
                const body = `התראה: ${ft.name}\nאתר: ${site.name}\nסיבה: ${message}\nזמן: ${now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`;
                const adminUsers = await db.entities.User.filter({ role: 'admin' });
                for (const admin of adminUsers) {
                  await db.integrations.Core.SendEmail({
                    to: admin.email,
                    subject: `⚠️ תקלה: ${ft.name} - ${site.name}`,
                    body
                  });
                }
              } catch (emailErr) {
                log.push(`[${ft.name}] Email failed: ${emailErr.message}`);
              }
            }
          } else {
            log.push(`[${ft.name}] Alert already open for site: ${site.name}`);
          }

        } else {
          if (existingAlert) {
            await db.entities.Alert.delete(existingAlert.id);
            log.push(`[${ft.name}] Alert AUTO-RESOLVED for site: ${site.name}`);
          } else {
            log.push(`[${ft.name}] OK on site: ${site.name}`);
          }
        }
      }
    }

    return Response.json({ success: true, checked: activeFaultTypes.length, sites: sites.length, triggered, log });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function evaluateRule(rule, site, inverters, expectedFraction, volatility, expectedSpecificYield, cyclicDropDays) {
  const { metric, operator, value, value_string } = rule;

  if (metric === 'power_volatility_index') {
    // For volatility: also check historical cyclic drop pattern (fan fault detection)
    // If 3+ days out of last 20 show cyclic drops, AND today's volatility is elevated, flag it
    if (operator === 'greater_than') return volatility > value;
    if (operator === 'less_than') return volatility < value;
    if (operator === 'less_than_percent_of_expected') {
      // Fan fault: check for recurring comb/derating drop pattern in last 20 days
      // Require 7+ days with the pattern to avoid false positives from occasional cloud artifacts
      return (cyclicDropDays || 0) >= 7;
    }
    return false;
  }

  let actual = null;
  switch (metric) {
    case 'current_power_kw': actual = site.current_power_kw ?? 0; break;
    case 'daily_yield_kwh': actual = site.daily_yield_kwh ?? 0; break;
    case 'current_efficiency': actual = site.current_efficiency ?? 100; break;
    case 'site_status': actual = site.status; break;
    case 'last_heartbeat_minutes_ago': {
      if (!site.last_heartbeat) { actual = 9999; break; }
      actual = (Date.now() - new Date(site.last_heartbeat).getTime()) / 60000;
      break;
    }
    case 'phase_voltage_l1': {
      const v = inverters.map(i => i.phase_voltages?.l1).filter(v => v != null);
      actual = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; break;
    }
    case 'phase_voltage_l2': {
      const v = inverters.map(i => i.phase_voltages?.l2).filter(v => v != null);
      actual = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; break;
    }
    case 'phase_voltage_l3': {
      const v = inverters.map(i => i.phase_voltages?.l3).filter(v => v != null);
      actual = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; break;
    }
    case 'inverter_status': {
      actual = inverters.some(i => i.status === value_string) ? value_string : 'online'; break;
    }
    case 'mppt_string_voltage': {
      const vArr = inverters.flatMap(i => {
        const strings = i.mppt_strings || [];
        if (strings.length > 0) return strings.map(s => s.voltage_v).filter(v => v != null);
        // No strings configured: estimate voltage = DC capacity (kWp) * 1500 V/kW
        const dcKwp = site.dc_capacity_kwp || 0;
        return dcKwp > 0 ? [dcKwp * 1500] : [];
      });
      actual = vArr.length ? Math.min(...vArr) : null; break;
    }
    case 'mppt_string_current': {
      const aArr = inverters.flatMap(i => {
        const strings = i.mppt_strings || [];
        if (strings.length > 0) return strings.map(s => s.current_a).filter(v => v != null);
        // No strings configured: skip, can't estimate current meaningfully
        return [];
      });
      actual = aArr.length ? Math.min(...aArr) : null; break;
    }
    case 'temperature_c': {
      const tArr = inverters.map(i => i.temperature_c).filter(v => v != null);
      actual = tArr.length ? Math.max(...tArr) : null; break;
    }
    default: return false;
  }

  if (actual === null) return false;
  if (typeof actual === 'string') {
    if (operator === 'equals') return actual === value_string;
    if (operator === 'not_equals') return actual !== value_string;
    return false;
  }
  if (operator === 'less_than') return actual < value;
  if (operator === 'greater_than') return actual > value;
  if (operator === 'equals') return actual === value;
  if (operator === 'not_equals') return actual !== value;
  if (operator === 'less_than_percent_of_expected') {
    // For power_volatility_index: compare volatility against value directly
    if (metric === 'power_volatility_index') {
      return volatility > value;
    }
    // For production metrics: use 20-day average specific yield
    // If we don't have 20 active days, we CANNOT evaluate - return false (no alert)
    if (expectedSpecificYield === null) return false;
    // expectedSpecificYield = avg daily kWh per kWp from last 20 active days
    // Compare today's yield per kWp against % of expected
    const todaySpecificYield = (site.daily_yield_kwh ?? 0) / (site.dc_capacity_kwp || 1);
    // Only evaluate after enough production hours (after 10:00)
    if (expectedFraction < 0.1) return false;
    // Scale expected by time-of-day fraction (how much of the day has passed)
    const fractionOfDayDone = expectedFraction; // 0-1 based on bell curve
    const expectedTodaySoFar = expectedSpecificYield * fractionOfDayDone;
    return todaySpecificYield < (value / 100) * expectedTodaySoFar;
  }
  return false;
}