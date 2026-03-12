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

    // Detect inverter AC clipping: flat graph at a consistent level below AC capacity for 1+ hour at peak
    // This indicates thermal derating / fan fault - inverter is capping output to protect itself
    function detectAcClipping(graphData, acCapacityKw) {
      if (!graphData || graphData.length < 12 || !acCapacityKw || acCapacityKw <= 0) return 0;
      
      // Focus on peak hours (10:00-15:00)
      const peakData = graphData.filter(p => {
        if (!p.time) return false;
        const h = parseInt(p.time.split(':')[0]);
        return h >= 10 && h <= 15;
      });
      if (peakData.length < 12) return 0;
      
      const values = peakData.map(p => p.value || 0);
      const maxValue = Math.max(...values);
      if (maxValue < acCapacityKw * 0.5) return 0; // system not producing enough to evaluate
      
      // Find the longest run where power is "flat" = within 3% of a consistent level AND below AC capacity
      // "Flat" means all values in a window are within 3% of their own mean
      const WINDOW_POINTS = 12; // 1 hour at 5-min intervals
      let maxFlatRunPercent = 0;
      
      for (let start = 0; start <= values.length - WINDOW_POINTS; start++) {
        const window = values.slice(start, start + WINDOW_POINTS);
        const avg = window.reduce((a, b) => a + b, 0) / window.length;
        if (avg < acCapacityKw * 0.5) continue; // too low to be clipping
        if (avg >= acCapacityKw * 0.98) continue; // at or above AC capacity = normal operation
        
        const maxDev = Math.max(...window.map(v => Math.abs(v - avg) / avg));
        if (maxDev < 0.03) { // flat within 3%
          const percentOfAc = (avg / acCapacityKw) * 100;
          if (percentOfAc < 98 && percentOfAc > 50) {
            maxFlatRunPercent = Math.max(maxFlatRunPercent, percentOfAc);
          }
        }
      }
      return Math.round(maxFlatRunPercent);
    }

    // Detect mid-day power drops to zero in today's graph
    // A "mid-day drop" = power was above threshold, then drops to near-zero, while surrounded by active production
    function countMidDayPowerDrops(graphData) {
      if (!graphData || graphData.length < 10) return 0;
      
      // Focus on daytime hours (08:00-17:00)
      const daytimeData = graphData.filter(p => {
        if (!p.time) return false;
        const parts = p.time.split(':');
        const hour = parseInt(parts[0]);
        return hour >= 8 && hour <= 17;
      });
      
      if (daytimeData.length < 5) return 0;
      
      const values = daytimeData.map(p => p.value || 0);
      const peak = Math.max(...values);
      if (peak < 2) return 0; // not enough production to evaluate
      
      let dropCount = 0;
      
      for (let i = 1; i < values.length - 1; i++) {
        // A drop: previous point was producing (>20% peak), current is near zero (<5% peak or <0.5kW)
        const wasProducing = values[i - 1] > peak * 0.20;
        const isNearZero = values[i] < Math.max(peak * 0.05, 0.5);
        
        if (wasProducing && isNearZero) {
          // Check: was there production AFTER this drop? (recovery or more production later)
          const hasProductionAfter = values.slice(i + 1).some(v => v > peak * 0.20);
          if (hasProductionAfter) {
            dropCount++;
            // Skip consecutive zero points (count as one drop event)
            while (i < values.length - 1 && values[i + 1] < Math.max(peak * 0.05, 0.5)) i++;
          }
        }
      }
      
      return dropCount;
    }

    // Rule-based evaluation (for fault types WITH detection_rules)
    function evaluateRules(ft, site, siteInverters, volatility, stationSnapshots) {
      if (!ft.detection_rules || ft.detection_rules.length === 0) return null; // no rules
      const needsVolatility = ft.detection_rules.some(r => r.metric === 'power_volatility_index');
      const needsExpectedYield = ft.detection_rules.some(r => r.operator === 'less_than_percent_of_expected' && r.metric !== 'power_volatility_index');
      const needsMidDayDrop = ft.detection_rules.some(r => r.metric === 'mid_day_power_drop_count');
      const needsClipping = ft.detection_rules.some(r => r.metric === 'ac_peak_clipping_percent');
      const expectedSpecificYield = needsExpectedYield ? computeExpectedSpecificYield(stationSnapshots, dateKey, site.dc_capacity_kwp) : null;
      const cyclicDropDays = needsVolatility ? countRectangularDropDays(stationSnapshots, dateKey) : 0;
      const midDayDrops = needsMidDayDrop ? countMidDayPowerDrops(stationSnapshots[dateKey] || null) : 0;
      const clippingPercent = needsClipping ? detectAcClipping(stationSnapshots[dateKey] || null, site.ac_capacity_kw) : 0;
      const ruleResults = ft.detection_rules.map(rule => evaluateRule(rule, site, siteInverters, expectedFraction, volatility, expectedSpecificYield, cyclicDropDays, midDayDrops, clippingPercent));
      const logic = ft.detection_logic || 'all';
      let triggered = logic === 'any' ? ruleResults.some(r => r) : ruleResults.every(r => r);

      // Apply detection_notes logic as hard rules (these override rule results)
      // "חוסר פאזה": only if 1-2 phases are down, NOT all 3. If all 3 down or no data = different fault.
      if (triggered && ft.alert_type === 'phase_voltage_out_of_range') {
        const phaseMetrics = ['phase_voltage_l1', 'phase_voltage_l2', 'phase_voltage_l3'];
        const phaseRules = ft.detection_rules.filter(r => phaseMetrics.includes(r.metric));
        if (phaseRules.length >= 2) {
          // Count how many phases are actually down per the rules
          const phaseResults = phaseMetrics.map(metric => {
            const rule = phaseRules.find(r => r.metric === metric);
            if (!rule) return false;
            return evaluateRule(rule, site, siteInverters, expectedFraction, volatility, expectedSpecificYield, cyclicDropDays, midDayDrops);
          });
          const phasesDown = phaseResults.filter(r => r).length;
          // Check if inverters have any voltage data at all
          const hasAnyVoltageData = siteInverters.some(inv => {
            const pv = inv.phase_voltages;
            return pv && (pv.l1 > 0 || pv.l2 > 0 || pv.l3 > 0);
          });
          if (phasesDown === 3 || !hasAnyVoltageData) {
            triggered = false; // All 3 down or no data = different fault per detection_notes
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

    // Handle alert creation/resolution for a single site+fault result
    async function handleAlertResult(ft, site, faultDetected, faultReason, openAlerts, triggered, log, db, now) {
      const existingAlert = openAlerts.find(a =>
        a.site_id === site.id &&
        a.fault_type_name === ft.name &&
        !a.is_resolved
      );

      if (faultDetected) {
        triggered.push({ fault_type: ft.name, site_name: site.name, site_id: site.id, severity: ft.severity });
        log.push(`[${ft.name}] DETECTED on site: ${site.name}`);

        if (!existingAlert) {
          const message = faultReason || ft.description || ft.name;
          const newAlert = await db.entities.Alert.create({
            site_id: site.id,
            site_name: site.name,
            type: ft.alert_type,
            severity: ft.severity,
            message,
            fault_type_name: ft.name,
            is_resolved: false
          });
          // Add to openAlerts in-memory so subsequent checks (SOLIS_STATUS) don't create duplicates
          openAlerts.push({ ...(newAlert || {}), site_id: site.id, fault_type_name: ft.name, is_resolved: false });
          log.push(`[${ft.name}] Alert created for site: ${site.name} - ${message}`);

          // Send notifications to site owner only
          const timeStr = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
          const severityIcon = ft.severity === 'critical' ? '🔴' : ft.severity === 'warning' ? '🟡' : 'ℹ️';
          const severityText = ft.severity === 'critical' ? 'קריטית' : ft.severity === 'warning' ? 'אזהרה' : 'מידע';
          const solutionText = ft.solution ? `\n\n💡 *פתרון מוצע:*\n${ft.solution}` : '';

          // WhatsApp formatted message - use custom template if defined
          let whatsappMsg;
          if (ft.whatsapp_template && ft.whatsapp_template.trim()) {
            whatsappMsg = ft.whatsapp_template
              .replace(/{site_name}/g, site.name)
              .replace(/{fault_type}/g, ft.name)
              .replace(/{message}/g, message)
              .replace(/{contact_name}/g, site.contact_name || '---')
              .replace(/{solution}/g, ft.solution || '')
              .replace(/{timestamp}/g, timeStr)
              .replace(/{severity}/g, severityText);
          } else {
            whatsappMsg = `━━━━━━━━━━━━━━━━━━━━━
⚡ *Panel Sense AI* ⚡
━━━━━━━━━━━━━━━━━━━━━

${severityIcon} *התראת תקלה - ${severityText}*

📍 *אתר:* ${site.name}
👤 *לקוח:* ${site.contact_name || '---'}
⚠️ *סוג תקלה:* ${ft.name}

📋 *פירוט:*
${message}${solutionText}

🕐 *זמן זיהוי:* ${timeStr}

━━━━━━━━━━━━━━━━━━━━━
_נא לטפל בתקלה בהקדם._
_הודעת תזכורת תישלח תוך 24 שעות_
_אם התקלה לא תטופל._
━━━━━━━━━━━━━━━━━━━━━
🌐 *Panel Sense AI* - ניטור חכם למערכות סולאריות`;
          }

          // Email to site owner
          if (ft.notify_email && site.contact_email) {
            try {
              const emailBody = `התראת תקלה - ${severityText}\n\nאתר: ${site.name}\nלקוח: ${site.contact_name || '---'}\nסוג תקלה: ${ft.name}\nפירוט: ${message}${ft.solution ? '\nפתרון מוצע: ' + ft.solution : ''}\nזמן זיהוי: ${timeStr}\n\nנא לטפל בתקלה בהקדם.\n\nPanel Sense AI - ניטור חכם למערכות סולאריות`;
              await db.integrations.Core.SendEmail({
                to: site.contact_email,
                subject: `${severityIcon} התראת תקלה: ${ft.name} - ${site.name}`,
                body: emailBody
              });
              log.push(`[${ft.name}] Email sent to site owner ${site.contact_email} for: ${site.name}`);
            } catch (emailErr) {
              log.push(`[${ft.name}] Email failed for ${site.name}: ${emailErr.message}`);
            }
          }

          // WhatsApp to site owner
          if (ft.notify_whatsapp && site.contact_phone) {
            try {
              const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
              const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
              if (accountSid && authToken) {
                let phoneNormalized = site.contact_phone.trim();
                // Convert Israeli local format (05X...) to international (+972...)
                if (phoneNormalized.startsWith('0') && !phoneNormalized.startsWith('00')) {
                  phoneNormalized = '+972' + phoneNormalized.slice(1);
                }
                const toFormatted = phoneNormalized.startsWith('whatsapp:') ? phoneNormalized : `whatsapp:${phoneNormalized}`;
                const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
                const params = new URLSearchParams({
                  To: toFormatted,
                  From: 'whatsapp:+14155238886',
                  Body: whatsappMsg,
                });
                const waRes = await fetch(url, {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: params.toString(),
                });
                if (waRes.ok) {
                  log.push(`[${ft.name}] WhatsApp sent to ${site.contact_phone} for: ${site.name}`);
                } else {
                  const waErr = await waRes.json();
                  log.push(`[${ft.name}] WhatsApp failed for ${site.name}: ${waErr.message || JSON.stringify(waErr)}`);
                }
              }
            } catch (waErr) {
              log.push(`[${ft.name}] WhatsApp error: ${waErr.message}`);
            }
          }
        } else {
          log.push(`[${ft.name}] Alert already open for site: ${site.name}`);
        }
      } else {
        log.push(`[${ft.name}] OK on site: ${site.name}`);
      }
    }

    // Build a descriptive reason string from site data (used as fallback if LLM doesn't run)
    function buildFaultReason(ft, site, siteInverters, volatility, stationSnapshots, dateKey) {
      const reasons = [];
      // Check for AC clipping
      if (ft.detection_rules?.some(r => r.metric === 'ac_peak_clipping_percent')) {
        const cp = detectAcClipping(stationSnapshots[dateKey] || null, site.ac_capacity_kw);
        if (cp > 0) reasons.push(`הממיר מקטם ב-${cp}% מה-AC capacity (${site.ac_capacity_kw} kW) - גרף שטוח של שעה+ בשיא`);
      }
      if (ft.alert_type === 'inverter_fault') {
        const temps = siteInverters.map(i => i.temperature_c).filter(v => v != null);
        const maxTemp = temps.length ? Math.max(...temps) : null;
        // Use the actual threshold from the rule, not a hardcoded value
        const tempRule = ft.detection_rules?.find(r => r.metric === 'temperature_c');
        const tempThreshold = tempRule?.value ?? 60;
        if (maxTemp !== null && maxTemp > tempThreshold) reasons.push(`טמפרטורה ${maxTemp}°C`);
        if (volatility > 50) reasons.push(`תנודתיות ${volatility}`);
        const cyclicDays = countRectangularDropDays(stationSnapshots, dateKey);
        if (cyclicDays >= 7) reasons.push(`${cyclicDays} ימים עם דפוס מסרק (derating) מ-20 אחרונים`);
      } else if (ft.alert_type === 'phase_voltage_out_of_range') {
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
      if (ft.alert_type === 'mid_day_power_drop') {
        const drops = countMidDayPowerDrops(stationSnapshots[dateKey] || null);
        if (drops > 0) reasons.push(`${drops} נפילות חדות לאפס באמצע היום`);
      }
      return reasons.length > 0 ? reasons.join(', ') : 'זוהה לפי חוקי זיהוי';
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
        const snapKey = site.solis_station_id || (site.sungrow_station_id ? `sg_${site.sungrow_station_id}` : null);
        const stationSnapshots = snapKey ? (snapshotsByStation[snapKey] || {}) : {};
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
              faultReason = buildFaultReason(ft, site, siteInverters, volatility, stationSnapshots, dateKey);
            }
          }
        }

        // LLM: Pure LLM detection - ONLY when no rules defined, uses detection_notes / reference_images
        if ((hasNotes || hasImages) && !hasRules && !faultDetected) {
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

        // Handle alert creation/resolution
        await handleAlertResult(ft, site, faultDetected, faultReason, openAlerts, triggered, log, db, now);
      }
    }

    // === SOLIS STATUS: For sites with warning/offline from Solis that have no open alert, match to a FaultType via LLM ===
    for (const site of sites) {
      // Auto-resolve Solis-status alerts if site came back online
      if (site.status === 'online') {
        const solisAlert = openAlerts.find(a =>
          a.site_id === site.id &&
          a.fault_type_name?.startsWith('סטטוס Solis:') &&
          !a.is_resolved
        );
        if (solisAlert) {
          await db.entities.Alert.update(solisAlert.id, { is_resolved: true, resolved_date: now.toISOString() });
          log.push(`[SOLIS_STATUS] Auto-resolved for ${site.name} (back online)`);
        }
        continue;
      }
      // Only handle OFFLINE via SOLIS_STATUS path.
      // WARNING sites are handled by the regular rule-based detection above - do NOT double-process them here.
      if (site.status !== 'offline') continue;

      // Skip if already has an open alert (from rules or previous Solis check)
      const existingAlert = openAlerts.find(a => a.site_id === site.id && !a.is_resolved);
      if (existingAlert) {
        log.push(`[SOLIS_STATUS] ${site.name} (${site.status}) - alert already open: ${existingAlert.fault_type_name}`);
        continue;
      }

      // Use LLM to match the site condition to the best matching active FaultType
      const siteInverters = inverters.filter(inv => inv.site_id === site.id);
      const snapKeyAlt = site.solis_station_id || (site.sungrow_station_id ? `sg_${site.sungrow_station_id}` : null);
      const stationSnapshots = snapKeyAlt ? (snapshotsByStation[snapKeyAlt] || {}) : {};

      const faultTypeSummaries = activeFaultTypes.map(ft => ({
        name: ft.name,
        alert_type: ft.alert_type,
        severity: ft.severity,
        description: ft.description || '',
        detection_notes: ft.detection_notes || ''
      }));

      const siteContext = {
        name: site.name,
        status: site.status,
        current_power_kw: site.current_power_kw,
        daily_yield_kwh: site.daily_yield_kwh,
        current_efficiency: site.current_efficiency,
        last_heartbeat: site.last_heartbeat,
        dc_capacity_kwp: site.dc_capacity_kwp
      };

      const inverterContext = siteInverters.map(inv => ({
        name: inv.name,
        status: inv.status,
        temperature_c: inv.temperature_c,
        current_ac_power_kw: inv.current_ac_power_kw,
        phase_voltages: inv.phase_voltages,
        mppt_strings: inv.mppt_strings
      }));

      let matchedFt = null;
      let matchReason = '';

      try {
        const matchResult = await db.integrations.Core.InvokeLLM({
          prompt: `אתה מומחה לניטור מערכות סולאריות.

אתר "${site.name}" מדווח סטטוס "${site.status}" ממערכת Solis.

נתוני האתר:
${JSON.stringify(siteContext, null, 2)}

נתוני אינוורטרים:
${JSON.stringify(inverterContext, null, 2)}

רשימת סוגי התקלות המוגדרים במערכת:
${JSON.stringify(faultTypeSummaries, null, 2)}

המשימה: קבע איזה סוג תקלה מהרשימה לעיל מתאים ביותר לסטטוס "${site.status}" של האתר הזה.
- אם מדובר ב-offline / אין heartbeat / אין תקשורת - בחר סוג תקלת תקשורת
- אם מדובר ב-warning עם הספק נמוך - בחר תקלת ייצור נמוך
- אם אינך בטוח, בחר את הסוג הכי קרוב שנראה הגיוני
- אם אין אף סוג מתאים, החזר null

ענה אך ורק במבנה JSON: {"fault_type_name": "שם סוג התקלה מהרשימה או null", "reason": "הסבר קצר בעברית"}`,
          response_json_schema: {
            type: 'object',
            properties: {
              fault_type_name: { type: ['string', 'null'] },
              reason: { type: 'string' }
            },
            required: ['fault_type_name', 'reason']
          }
        });

        if (matchResult?.fault_type_name) {
          const candidate = activeFaultTypes.find(ft => ft.name === matchResult.fault_type_name);
          if (candidate) {
            // CRITICAL: if the matched fault type has detection_rules, verify they actually pass.
            // This prevents the LLM from assigning a fault type whose thresholds are NOT met
            // (e.g. user set temp threshold to 75°C but inverter is only at 69°C)
            const hasRules = candidate.detection_rules && candidate.detection_rules.length > 0;
            if (hasRules) {
              const siteStationSnapshots = site.solis_station_id ? (snapshotsByStation[site.solis_station_id] || {}) : {};
              const graphData = siteStationSnapshots[dateKey] || null;
              const vol = computeVolatilityIndex(graphData);
              const rulesPass = evaluateRules(candidate, site, siteInverters, vol, siteStationSnapshots);
              if (rulesPass) {
                matchedFt = candidate;
                matchReason = matchResult.reason;
                log.push(`[SOLIS_STATUS] LLM matched ${site.name} → ${matchResult.fault_type_name} (rules verified): ${matchReason}`);
              } else {
                log.push(`[SOLIS_STATUS] LLM suggested ${matchResult.fault_type_name} for ${site.name} but detection_rules NOT met - skipping this fault type`);
                // Try to find the next best fault type WITHOUT rules (communication fault etc.)
                matchedFt = activeFaultTypes.find(ft =>
                  ft.name !== candidate.name &&
                  (!ft.detection_rules || ft.detection_rules.length === 0) &&
                  ft.alert_type === 'communication_fault'
                ) || null;
                if (matchedFt) {
                  matchReason = `סטטוס Solis: ${site.status}`;
                  log.push(`[SOLIS_STATUS] Fallback to communication fault type: ${matchedFt.name}`);
                }
              }
            } else {
              // No rules = pure description/LLM based, accept the match
              matchedFt = candidate;
              matchReason = matchResult.reason;
              log.push(`[SOLIS_STATUS] LLM matched ${site.name} → ${matchResult.fault_type_name}: ${matchReason}`);
            }
          }
        } else {
          log.push(`[SOLIS_STATUS] LLM found no matching fault type for ${site.name} (${site.status}): ${matchResult?.reason}`);
        }
      } catch (e) {
        log.push(`[SOLIS_STATUS] LLM error for ${site.name}: ${e.message}`);
      }

      if (!matchedFt) continue;

      // Create alert using the matched FaultType
      const message = matchReason || matchedFt.description || matchedFt.name;
      await db.entities.Alert.create({
        site_id: site.id,
        site_name: site.name,
        type: matchedFt.alert_type,
        severity: matchedFt.severity,
        message,
        fault_type_name: matchedFt.name,
        is_resolved: false
      });

      triggered.push({ fault_type: matchedFt.name, site_name: site.name, site_id: site.id, severity: matchedFt.severity });
      log.push(`[SOLIS_STATUS] Alert created for ${site.name} → ${matchedFt.name}`);

      // Send notifications using the matched FaultType's settings
      const timeStr = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
      const severityIcon = matchedFt.severity === 'critical' ? '🔴' : matchedFt.severity === 'warning' ? '🟡' : 'ℹ️';
      const severityText = matchedFt.severity === 'critical' ? 'קריטית' : matchedFt.severity === 'warning' ? 'אזהרה' : 'מידע';
      const solutionText = matchedFt.solution ? `\n\n💡 *פתרון מוצע:*\n${matchedFt.solution}` : '';

      if (matchedFt.notify_email && site.contact_email) {
        try {
          await db.integrations.Core.SendEmail({
            to: site.contact_email,
            subject: `${severityIcon} התראת תקלה: ${matchedFt.name} - ${site.name}`,
            body: `התראת תקלה - ${severityText}\n\nאתר: ${site.name}\nלקוח: ${site.contact_name || '---'}\nסוג תקלה: ${matchedFt.name}\nפירוט: ${message}${matchedFt.solution ? '\nפתרון מוצע: ' + matchedFt.solution : ''}\nזמן זיהוי: ${timeStr}\n\nPanel Sense AI`
          });
          log.push(`[SOLIS_STATUS] Email sent to ${site.contact_email} for: ${site.name}`);
        } catch (e) {
          log.push(`[SOLIS_STATUS] Email failed for ${site.name}: ${e.message}`);
        }
      }

      if (matchedFt.notify_whatsapp && site.contact_phone) {
        try {
          const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
          const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
          if (accountSid && authToken) {
            const whatsappMsg = `━━━━━━━━━━━━━━━━━━━━━\n⚡ *Panel Sense AI* ⚡\n━━━━━━━━━━━━━━━━━━━━━\n\n${severityIcon} *התראת תקלה - ${severityText}*\n\n📍 *אתר:* ${site.name}\n👤 *לקוח:* ${site.contact_name || '---'}\n⚠️ *סוג תקלה:* ${matchedFt.name}\n\n📋 *פירוט:*\n${message}${solutionText}\n\n🕐 *זמן זיהוי:* ${timeStr}\n\n━━━━━━━━━━━━━━━━━━━━━\n🌐 *Panel Sense AI*`;
            let phoneNorm2 = site.contact_phone.trim();
            if (phoneNorm2.startsWith('0') && !phoneNorm2.startsWith('00')) phoneNorm2 = '+972' + phoneNorm2.slice(1);
            const toFormatted = phoneNorm2.startsWith('whatsapp:') ? phoneNorm2 : `whatsapp:${phoneNorm2}`;
            const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
            const params = new URLSearchParams({ To: toFormatted, From: 'whatsapp:+14155238886', Body: whatsappMsg });
            const waRes = await fetch(url, { method: 'POST', headers: { 'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`), 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
            if (waRes.ok) {
              log.push(`[SOLIS_STATUS] WhatsApp sent to ${site.contact_phone} for: ${site.name}`);
            } else {
              const waErr = await waRes.json();
              log.push(`[SOLIS_STATUS] WhatsApp failed: ${waErr.message || JSON.stringify(waErr)}`);
            }
          }
        } catch (e) {
          log.push(`[SOLIS_STATUS] WhatsApp error: ${e.message}`);
        }
      }
    }

    // === 24-HOUR REMINDER: resend WhatsApp for unresolved alerts older than 24h ===
    const remindersSent = [];
    for (const alert of openAlerts) {
      const alertAge = (now.getTime() - new Date(alert.created_date).getTime()) / (1000 * 60 * 60);
      if (alertAge < 24) continue; // not yet 24h old

      // Check if reminder was already sent (use updated_date as marker - if updated within last 23h, skip)
      const lastUpdate = new Date(alert.updated_date || alert.created_date);
      const hoursSinceLastNotification = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastNotification < 24) continue; // already reminded recently

      const alertSite = sites.find(s => s.id === alert.site_id);
      if (!alertSite || !alertSite.contact_phone) continue;

      const ft = faultTypes.find(f => f.name === alert.fault_type_name);
      if (!ft || !ft.notify_whatsapp) continue;

      const timeStr = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
      const createdStr = new Date(alert.created_date).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
      const hoursOpen = Math.round(alertAge);
      const severityIcon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : 'ℹ️';
      const severityText = alert.severity === 'critical' ? 'קריטית' : alert.severity === 'warning' ? 'אזהרה' : 'מידע';

      const reminderMsg = `━━━━━━━━━━━━━━━━━━━━━
⚡ *Panel Sense AI* ⚡
━━━━━━━━━━━━━━━━━━━━━

🔔 *תזכורת לתיקון* 🔔

${severityIcon} *התראה ${severityText} - טרם טופלה*

📍 *אתר:* ${alertSite.name}
👤 *לקוח:* ${alertSite.contact_name || '---'}
⚠️ *סוג תקלה:* ${alert.fault_type_name}

📋 *פירוט:*
${alert.message}

⏰ *זמן זיהוי מקורי:* ${createdStr}
⏳ *זמן פתוח:* ${hoursOpen} שעות

━━━━━━━━━━━━━━━━━━━━━
⚠️ *התקלה עדיין לא טופלה!*
_נא לטפל בדחיפות._
━━━━━━━━━━━━━━━━━━━━━
🌐 *Panel Sense AI* - ניטור חכם למערכות סולאריות`;

      try {
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        if (accountSid && authToken) {
          let phoneNorm3 = alertSite.contact_phone.trim();
          if (phoneNorm3.startsWith('0') && !phoneNorm3.startsWith('00')) phoneNorm3 = '+972' + phoneNorm3.slice(1);
          const toFormatted = phoneNorm3.startsWith('whatsapp:') ? phoneNorm3 : `whatsapp:${phoneNorm3}`;
          const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
          const params = new URLSearchParams({
            To: toFormatted,
            From: 'whatsapp:+14155238886',
            Body: reminderMsg,
          });
          const waRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          });
          if (waRes.ok) {
            // Update alert's updated_date to track when reminder was sent
            await db.entities.Alert.update(alert.id, { message: alert.message });
            remindersSent.push({ alert_id: alert.id, site: alertSite.name, fault: alert.fault_type_name });
            log.push(`[REMINDER] WhatsApp reminder sent to ${alertSite.contact_phone} for: ${alertSite.name} - ${alert.fault_type_name} (open ${hoursOpen}h)`);
          } else {
            const waErr = await waRes.json();
            log.push(`[REMINDER] WhatsApp failed for ${alertSite.name}: ${waErr.message || JSON.stringify(waErr)}`);
          }
        }
      } catch (waErr) {
        log.push(`[REMINDER] WhatsApp error: ${waErr.message}`);
      }

      // Also send reminder email
      if (ft.notify_email && alertSite.contact_email) {
        try {
          const emailBody = `תזכורת לתיקון\n\nאתר: ${alertSite.name}\nלקוח: ${alertSite.contact_name || '---'}\nסוג תקלה: ${alert.fault_type_name}\nפירוט: ${alert.message}\nזמן זיהוי: ${createdStr}\nזמן פתוח: ${hoursOpen} שעות\n\nהתקלה עדיין לא טופלה - נא לטפל בדחיפות.\n\nPanel Sense AI - ניטור חכם למערכות סולאריות`;
          await db.integrations.Core.SendEmail({
            to: alertSite.contact_email,
            subject: `🔔 תזכורת לתיקון: ${alert.fault_type_name} - ${alertSite.name} (${hoursOpen} שעות)`,
            body: emailBody
          });
          log.push(`[REMINDER] Email sent to ${alertSite.contact_email} for: ${alertSite.name}`);
        } catch (emailErr) {
          log.push(`[REMINDER] Email failed: ${emailErr.message}`);
        }
      }
    }

    return Response.json({ success: true, checked: activeFaultTypes.length, sites: sites.length, triggered, reminders: remindersSent, log });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function evaluateRule(rule, site, inverters, expectedFraction, volatility, expectedSpecificYield, cyclicDropDays, midDayDrops, clippingPercent = 0) {
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
    case 'mid_day_power_drop_count': {
      actual = midDayDrops || 0;
      break;
    }
    case 'ac_peak_clipping_percent': {
      // ac_peak_clipping_percent: clippingPercent is % of AC capacity where inverter is stuck
      // operator "less_than_percent_of_expected" means: flat plateau IS detected below X% of AC
      // i.e., clippingPercent > 0 AND clippingPercent < value means clipping IS happening
      // But since we store it as "greater_than" (flat plateau > X%), handle both operators here directly
      if (operator === 'greater_than') return (clippingPercent || 0) > value;
      if (operator === 'less_than') return (clippingPercent || 0) < value && (clippingPercent || 0) > 0;
      if (operator === 'less_than_percent_of_expected') {
        // "קיטום מתחת ל-X% מ-AC" = detected flat plateau below X% of AC capacity
        return (clippingPercent || 0) > 0 && (clippingPercent || 0) < value;
      }
      actual = clippingPercent || 0;
      break;
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
    if (expectedSpecificYield === null) return false;
    const todaySpecificYield = (site.daily_yield_kwh ?? 0) / (site.dc_capacity_kwp || 1);
    if (expectedFraction < 0.1) return false;
    const expectedTodaySoFar = expectedSpecificYield * expectedFraction;
    return todaySpecificYield < (value / 100) * expectedTodaySoFar;
  }
  return false;
}