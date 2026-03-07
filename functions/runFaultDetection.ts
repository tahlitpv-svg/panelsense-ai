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

    // Daylight check helper
    function isDaylight(ft) {
      if (!ft.check_only_during_daylight) return true;
      return localHour >= 6 && localHour < 20;
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

    // Rule-based evaluation (for fault types WITH detection_rules)
    function evaluateRules(ft, site, siteInverters, volatility, expectedSpecificYield) {
      if (!ft.detection_rules || ft.detection_rules.length === 0) return null; // no rules
      const ruleResults = ft.detection_rules.map(rule => evaluateRule(rule, site, siteInverters, expectedFraction, volatility, expectedSpecificYield));
      const logic = ft.detection_logic || 'all';
      return logic === 'any' ? ruleResults.some(r => r) : ruleResults.every(r => r);
    }

    // LLM-based evaluation (for fault types WITH detection_notes)
    async function evaluateWithLLM(ft, site, siteInverters, stationSnapshots, volatility) {
      if (!ft.detection_notes) return null; // no notes

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

      const prompt = `אתה מומחה לניטור מערכות סולאריות.

⚠️ חשוב מאוד: תפקידך הוא לבדוק האם התקלה הספציפית "${ft.name}" קיימת לפי ההגדרה שניתנה. אל תמציא תקלות אחרות, אל תאבחן בעיות שלא ביקשו, ורק ענה true אם יש עדות ברורה לפי הקריטריונים שלהלן.

הוראות זיהוי התקלה "${ft.name}":
${ft.detection_notes}

נתוני האתר כרגע (${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}):
${JSON.stringify(siteContext, null, 2)}

נתוני אינוורטרים:
${JSON.stringify(inverterContext, null, 2)}

היסטוריית ייצור 20 ימים אחרונים:
${historicalSummary || 'אין נתונים היסטוריים'}

${todayGraphSummary}

מדד תנודתיות הספק היומי (0=יציב, 100=תנודתי מאוד): ${volatility}

שאלה: האם יש סימנים לתקלה "${ft.name}" באתר זה לפי ההוראות שניתנו? התייחס גם להיסטוריה של 20 הימים האחרונים וגם לגרף היום המלא.
ענה אך ורק במבנה JSON: {"fault_detected": true/false, "reason": "הסבר קצר בעברית"}`;

      try {
        const result = await db.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              fault_detected: { type: 'boolean' },
              reason: { type: 'string' }
            },
            required: ['fault_detected', 'reason']
          }
        });
        return result;
      } catch (llmErr) {
        log.push(`[${ft.name}] LLM error for ${site.name}: ${llmErr.message}`);
        return null;
      }
    }

    for (const ft of activeFaultTypes) {
      if (!isDaylight(ft)) {
        log.push(`[${ft.name}] Skipped - outside daylight hours`);
        continue;
      }

      const hasRules = ft.detection_rules && ft.detection_rules.length > 0;
      const hasNotes = false; // LLM disabled: enforce rule-based detection only

      if (!hasRules && !hasNotes) {
        log.push(`[${ft.name}] Skipped - no detection rules or notes defined`);
        continue;
      }

      for (const site of sites) {
        const siteInverters = inverters.filter(inv => inv.site_id === site.id);
        const stationSnapshots = site.solis_station_id ? (snapshotsByStation[site.solis_station_id] || {}) : {};
        const graphData = stationSnapshots[dateKey] || null; // today's data
        const volatility = computeVolatilityIndex(graphData);

        let faultDetected = false;
        let faultReason = '';

        // Compute expected specific yield for this site (20-day average)
        const expectedSpecificYield = computeExpectedSpecificYield(stationSnapshots, dateKey, site.dc_capacity_kwp);

        if (hasRules) {
          // Rule-based check first
          const ruleResult = evaluateRules(ft, site, siteInverters, volatility, expectedSpecificYield);
          if (ruleResult !== null) {
            faultDetected = ruleResult;
            faultReason = faultDetected ? 'זוהה לפי חוקי זיהוי' : '';
          }
        }

        if (false && hasNotes && (!hasRules || faultDetected === false)) {
          // LLM check - only for evaluating THIS specific fault type based on its detection_notes
          // The LLM must NOT invent new fault types - it only judges if THIS fault type is detected
          const llmResult = await evaluateWithLLM(ft, site, siteInverters, stationSnapshots, volatility);
          if (false && llmResult !== null) {
            if (llmResult.fault_detected) {
              faultDetected = true;
              faultReason = llmResult.reason;
            }
            log.push(`[${ft.name}] LLM for ${site.name}: ${llmResult.fault_detected ? 'FAULT' : 'OK'} - ${llmResult.reason}`);
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

function evaluateRule(rule, site, inverters, expectedFraction, volatility, expectedSpecificYield) {
  const { metric, operator, value, value_string } = rule;

  if (metric === 'power_volatility_index') {
    if (operator === 'greater_than') return volatility > value;
    if (operator === 'less_than') return volatility < value;
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
    // Use 20-day average specific yield. If not enough data (< 20 active days), skip.
    if (expectedSpecificYield === null || expectedSpecificYield === undefined) return false;
    if (expectedFraction < 0.1) return false; // not during daylight peak
    // Expected power right now = (kWh/kWp/day average) * kWp * fraction_of_day_curve / peak_hours_equivalent
    // Simplified: expectedSpecificYield is kWh/kWp/day, convert to expected kW at this moment
    // Total daily expected = expectedSpecificYield * dcKwp
    // Power at this moment = totalDaily * bellCurveFraction * normalization
    // Bell curve integral over a day ≈ 2/π, so peak factor = π/2
    const dcKwp = site.dc_capacity_kwp || 1;
    const expectedPowerNow = expectedSpecificYield * dcKwp * expectedFraction * (Math.PI / 2) / 24;
    if (expectedPowerNow < 0.5) return false; // too low to compare meaningfully
    return (site.current_power_kw ?? 0) < (value / 100) * expectedPowerNow;
  }
  return false;
}