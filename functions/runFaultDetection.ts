import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    // Allow both authenticated calls and scheduled automation calls
    // For scheduled runs, use service role
    const db = base44.asServiceRole;

    const now = new Date();
    const localHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getHours();
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

    // Load all sites and their inverters
    const [sites, inverters] = await Promise.all([
      db.entities.Site.list(),
      db.entities.Inverter.list()
    ]);

    for (const ft of activeFaultTypes) {
      // Daylight check
      if (ft.check_only_during_daylight && (localHour < 6 || localHour >= 19)) {
        log.push(`[${ft.name}] Skipped - outside daylight hours (${localHour}:00)`);
        continue;
      }

      for (const site of sites) {
        const siteInverters = inverters.filter(inv => inv.site_id === site.id);

        // Evaluate rules for this site
        const ruleResults = ft.detection_rules.map(rule => evaluateRule(rule, site, siteInverters));
        const logic = ft.detection_logic || 'all';
        const faultDetected = logic === 'any'
          ? ruleResults.some(r => r)
          : ruleResults.every(r => r);

        if (faultDetected) {
          triggered.push({ fault_type: ft.name, site_name: site.name, site_id: site.id, severity: ft.severity });
          log.push(`[${ft.name}] DETECTED on site: ${site.name}`);

          // Create an alert if not already open
          const existingAlerts = await db.entities.Alert.filter({
            site_id: site.id,
            type: ft.alert_type,
            is_resolved: false
          });

          if (existingAlerts.length === 0) {
            await db.entities.Alert.create({
              site_id: site.id,
              site_name: site.name,
              type: ft.alert_type,
              severity: ft.severity,
              message: ft.description || ft.name,
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

                // Get admin users to email
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
          log.push(`[${ft.name}] OK on site: ${site.name}`);
        }
      }
    }

    return Response.json({ success: true, checked: activeFaultTypes.length, sites: sites.length, triggered, log });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function evaluateRule(rule, site, inverters) {
  const { metric, operator, value, value_string } = rule;

  let actual = null;

  // Extract the metric value
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
      // True if ANY inverter matches
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

  // Evaluate operator
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
    // Compare to expected: site.dc_capacity_kwp * value% 
    const expected = site.dc_capacity_kwp || 1;
    return actual < (expected * value / 100);
  }

  return false;
}