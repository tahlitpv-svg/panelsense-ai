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

    // Today's date key
    const dateKey = localDate.toISOString().slice(0, 10);

    const log = [];
    const triggered = [];

    const faultTypes = await db.entities.FaultType.list();
    const activeFaultTypes = faultTypes.filter(ft =>
      ft.is_active && ft.detection_rules && ft.detection_rules.length > 0
    );

    if (activeFaultTypes.length === 0) {
      return Response.json({ message: 'No active fault types with detection rules.', log });
    }

    // Check if any fault type uses power_volatility_index
    const needsSnapshots = activeFaultTypes.some(ft =>
      ft.detection_rules.some(r => r.metric === 'power_volatility_index')
    );

    // Load sites, inverters, open alerts
    const [sites, inverters, openAlerts] = await Promise.all([
      db.entities.Site.list(),
      db.entities.Inverter.list(),
      db.entities.Alert.filter({ is_resolved: false })
    ]);

    // Load today's graph snapshots if needed (volatility detection)
    let snapshotsByStation = {};
    if (needsSnapshots) {
      const snapshots = await db.entities.SiteGraphSnapshot.filter({ date_key: dateKey });
      for (const snap of snapshots) {
        snapshotsByStation[snap.station_id] = snap.data || [];
      }
    }

    // Compute volatility index for each site (0..100)
    // Algorithm: count direction reversals in the power curve, weighted by amplitude
    function computeVolatilityIndex(data) {
      if (!data || data.length < 5) return 0;

      // Only look at daytime data (values > 0.5 kW to avoid noise at dawn/dusk)
      const daytime = data.filter(d => d.value > 0.5);
      if (daytime.length < 5) return 0;

      const values = daytime.map(d => d.value);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      if (avg < 1) return 0;

      // Count direction reversals
      let reversals = 0;
      let prevDir = 0;
      for (let i = 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        const dir = diff > 0.3 ? 1 : diff < -0.3 ? -1 : 0;
        if (dir !== 0 && prevDir !== 0 && dir !== prevDir) {
          reversals++;
        }
        if (dir !== 0) prevDir = dir;
      }

      // Standard deviation as % of mean
      const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const cvPercent = (stdDev / avg) * 100;

      // Combine: reversals (normalized to data length) and CV%
      const reversalScore = Math.min(100, (reversals / (values.length - 1)) * 200);
      const cvScore = Math.min(100, cvPercent * 2);

      // Weighted: reversals matter more (thermal throttling = many direction changes)
      return Math.round(reversalScore * 0.6 + cvScore * 0.4);
    }

    // Pre-compute volatility per site
    const siteVolatility = {};
    for (const site of sites) {
      if (!needsSnapshots) break;
      const stationId = site.solis_station_id;
      const data = stationId ? snapshotsByStation[stationId] : null;
      siteVolatility[site.id] = computeVolatilityIndex(data);
    }

    function getExpectedPowerFraction(minSinceMidnight) {
      const sunrise = 360;
      const sunset = 1170;
      if (minSinceMidnight <= sunrise || minSinceMidnight >= sunset) return 0;
      const pos = (minSinceMidnight - sunrise) / (sunset - sunrise);
      return Math.sin(pos * Math.PI);
    }

    const expectedFraction = getExpectedPowerFraction(minutesSinceMidnight);

    for (const ft of activeFaultTypes) {
      if (ft.check_only_during_daylight && (localHour < 6 || localHour >= 20)) {
        log.push(`[${ft.name}] Skipped - outside daylight hours (${localHour}:00)`);
        continue;
      }

      for (const site of sites) {
        const siteInverters = inverters.filter(inv => inv.site_id === site.id);
        const volatility = siteVolatility[site.id] ?? 0;

        const ruleResults = ft.detection_rules.map(rule =>
          evaluateRule(rule, site, siteInverters, expectedFraction, volatility)
        );
        const logic = ft.detection_logic || 'all';
        const faultDetected = logic === 'any'
          ? ruleResults.some(r => r)
          : ruleResults.every(r => r);

        const existingAlert = openAlerts.find(a =>
          a.site_id === site.id &&
          a.type === ft.alert_type &&
          a.fault_type_name === ft.name &&
          !a.is_resolved
        );

        if (faultDetected) {
          triggered.push({ fault_type: ft.name, site_name: site.name, site_id: site.id, severity: ft.severity, volatility });
          log.push(`[${ft.name}] DETECTED on site: ${site.name}${volatility > 0 ? ` (volatility: ${volatility})` : ''}`);

          if (!existingAlert) {
            // Build meaningful message
            let message = ft.description || ft.name;
            if (ft.detection_rules.some(r => r.metric === 'power_volatility_index') && volatility > 0) {
              message += ` (מדד תנודתיות: ${volatility}/100)`;
            }

            await db.entities.Alert.create({
              site_id: site.id,
              site_name: site.name,
              type: ft.alert_type,
              severity: ft.severity,
              message,
              fault_type_name: ft.name,
              is_resolved: false
            });
            log.push(`[${ft.name}] Alert created for site: ${site.name}`);

            if (ft.notify_email) {
              try {
                const template = ft.email_template ||
                  `התראה: ${ft.name}\nאתר: ${site.name}\nזמן: ${now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}\n${message}`;
                const body = template
                  .replace('{site_name}', site.name)
                  .replace('{fault_type}', ft.name)
                  .replace('{timestamp}', now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }));

                const adminUsers = await db.entities.User.filter({ role: 'admin' });
                for (const admin of adminUsers) {
                  await db.integrations.Core.SendEmail({
                    to: admin.email,
                    subject: `⚠️ תקלה: ${ft.name} - ${site.name}`,
                    body
                  });
                }
              } catch (emailErr) {
                log.push(`[${ft.name}] Email send failed: ${emailErr.message}`);
              }
            }
          } else {
            log.push(`[${ft.name}] Alert already open for site: ${site.name}, skipping`);
          }

        } else {
          if (existingAlert) {
            await db.entities.Alert.delete(existingAlert.id);
            log.push(`[${ft.name}] Alert AUTO-RESOLVED and removed for site: ${site.name}`);
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

function evaluateRule(rule, site, inverters, expectedFraction, volatility) {
  const { metric, operator, value, value_string } = rule;

  // Special metric: power volatility index (pre-computed)
  if (metric === 'power_volatility_index') {
    if (operator === 'greater_than') return volatility > value;
    if (operator === 'less_than') return volatility < value;
    if (operator === 'equals') return volatility === value;
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
      actual = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      break;
    }
    case 'phase_voltage_l2': {
      const v = inverters.map(i => i.phase_voltages?.l2).filter(v => v != null);
      actual = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      break;
    }
    case 'phase_voltage_l3': {
      const v = inverters.map(i => i.phase_voltages?.l3).filter(v => v != null);
      actual = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      break;
    }
    case 'inverter_status': {
      actual = inverters.some(i => i.status === value_string) ? value_string : 'online';
      break;
    }
    case 'mppt_string_voltage': {
      const vArr = inverters.flatMap(i => (i.mppt_strings || []).map(s => s.voltage_v)).filter(v => v != null);
      actual = vArr.length ? Math.min(...vArr) : null;
      break;
    }
    case 'mppt_string_current': {
      const aArr = inverters.flatMap(i => (i.mppt_strings || []).map(s => s.current_a)).filter(v => v != null);
      actual = aArr.length ? Math.min(...aArr) : null;
      break;
    }
    case 'temperature_c': {
      const tArr = inverters.map(i => i.temperature_c).filter(v => v != null);
      actual = tArr.length ? Math.max(...tArr) : null;
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
    if (expectedFraction < 0.1) return false;
    const dcCapacity = site.dc_capacity_kwp || 1;
    const systemEfficiency = 0.82;
    const expectedPower = dcCapacity * expectedFraction * systemEfficiency;
    const threshold = (value / 100) * expectedPower;
    const liveMetric = metric === 'current_power_kw' ? actual : (site.current_power_kw ?? 0);
    return liveMetric < threshold;
  }

  return false;
}