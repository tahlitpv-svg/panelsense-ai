import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const now = new Date();
    const localDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const localHour = localDate.getHours();
    const localMinute = localDate.getMinutes();
    // Minutes since midnight (local)
    const minutesSinceMidnight = localHour * 60 + localMinute;

    const log = [];
    const triggered = [];

    // Load all active fault types that have detection rules
    const faultTypes = await db.entities.FaultType.list();
    const activeFaultTypes = faultTypes.filter(ft =>
      ft.is_active && ft.detection_rules && ft.detection_rules.length > 0
    );

    if (activeFaultTypes.length === 0) {
      return Response.json({ message: 'No active fault types with detection rules.', log });
    }

    // Load all sites, inverters, and open alerts
    const [sites, inverters, openAlerts] = await Promise.all([
      db.entities.Site.list(),
      db.entities.Inverter.list(),
      db.entities.Alert.filter({ is_resolved: false })
    ]);

    // Build a map of site solar data context
    // For "low production" checks, we calculate expected power at this hour
    // Expected = dc_capacity_kwp * estimated_irradiance_factor
    // We use a simple bell curve: peak at solar noon (13:00 local = 780 min), 0 before sunrise (6:00=360) and after sunset (19:30=1170)
    function getExpectedPowerFraction(minutesSinceMidnight) {
      const sunrise = 360;  // 6:00
      const sunset = 1170;  // 19:30
      const peak = 780;     // 13:00
      if (minutesSinceMidnight <= sunrise || minutesSinceMidnight >= sunset) return 0;
      // Normalized position in the day (0 to 1)
      const range = sunset - sunrise;
      const pos = (minutesSinceMidnight - sunrise) / range;
      // Bell curve: sin(pos * PI)
      return Math.sin(pos * Math.PI);
    }

    const expectedFraction = getExpectedPowerFraction(minutesSinceMidnight);

    for (const ft of activeFaultTypes) {
      // Daylight check
      if (ft.check_only_during_daylight && (localHour < 6 || localHour >= 20)) {
        log.push(`[${ft.name}] Skipped - outside daylight hours (${localHour}:00)`);
        continue;
      }

      for (const site of sites) {
        const siteInverters = inverters.filter(inv => inv.site_id === site.id);

        // Evaluate rules for this site
        const ruleResults = ft.detection_rules.map(rule =>
          evaluateRule(rule, site, siteInverters, expectedFraction)
        );
        const logic = ft.detection_logic || 'all';
        const faultDetected = logic === 'any'
          ? ruleResults.some(r => r)
          : ruleResults.every(r => r);

        // Find existing open alert for this fault type + site
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
            await db.entities.Alert.create({
              site_id: site.id,
              site_name: site.name,
              type: ft.alert_type,
              severity: ft.severity,
              message: ft.description || ft.name,
              fault_type_name: ft.name,
              is_resolved: false
            });
            log.push(`[${ft.name}] Alert created for site: ${site.name}`);

            // Send email if configured
            if (ft.notify_email) {
              try {
                const template = ft.email_template ||
                  `התראה: ${ft.name}\nאתר: ${site.name}\nזמן: ${now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}\n${ft.description || ''}`;
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
          // Fault NOT detected - if there was an open alert, auto-resolve (delete) it
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

function evaluateRule(rule, site, inverters, expectedFraction) {
  const { metric, operator, value, value_string } = rule;

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

  // String comparisons
  if (typeof actual === 'string') {
    if (operator === 'equals') return actual === value_string;
    if (operator === 'not_equals') return actual !== value_string;
    return false;
  }

  // Numeric comparisons
  if (operator === 'less_than') return actual < value;
  if (operator === 'greater_than') return actual > value;
  if (operator === 'equals') return actual === value;
  if (operator === 'not_equals') return actual !== value;

  if (operator === 'less_than_percent_of_expected') {
    // Smart production check: expected power based on time-of-day irradiance curve
    // expectedFraction = 0..1 (bell curve through the day)
    // If it's basically night / very low irradiance, skip the check
    if (expectedFraction < 0.1) return false;

    const dcCapacity = site.dc_capacity_kwp || 1;
    // Typical inverter efficiency ~0.97, losses ~0.85 (wiring, temp, soiling)
    const systemEfficiency = 0.82;
    const expectedPower = dcCapacity * expectedFraction * systemEfficiency;

    // "value" in the rule is the percentage threshold (e.g. 40 means: actual < 40% of expected)
    const threshold = (value / 100) * expectedPower;

    // Use current_power_kw for this check (live metric)
    const liveMetric = metric === 'current_power_kw' ? actual : (site.current_power_kw ?? 0);
    return liveMetric < threshold;
  }

  return false;
}