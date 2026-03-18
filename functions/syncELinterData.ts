import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ELINTER_BASE = 'http://openapi.inteless.com/v1';
const APP_KEY = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME = 'm.b.g.shilo@gmail.com';
const PASSWORD = 'Cesc2024';

async function elinterLogin() {
  const params = new URLSearchParams({
    username:   USERNAME,
    password:   PASSWORD,
    grant_type: 'password',
    client_id:  'csp-web'
  });
  const res = await fetch(`${ELINTER_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const text = await res.text();
  const xErr = res.headers.get('x-ca-error-message') || '';
  console.log(`[elinter] Login status=${res.status} xErr="${xErr}" body=${text.substring(0, 300)}`);
  if (!text) throw new Error(`Login returned empty body. Status=${res.status} xErr=${xErr}`);
  const data = JSON.parse(text);
  if (!data?.access_token) throw new Error(`E-Linter login failed: ${JSON.stringify(data)}`);
  console.log('[elinter] Login OK');
  return data.access_token;
}

async function elGet(token, path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${ELINTER_BASE}${path}${query ? '?' + query : ''}`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  try { return await res.json(); } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    const token = await elinterLogin();

    let page = 1;
    let allInverters = [];
    while (true) {
      const res = await elGet(token, '/inverters', { page: String(page), limit: '50', type: '-1' });
      const items = res?.data || [];
      if (!items.length) break;
      allInverters = [...allInverters, ...items];
      if (items.length < 50) break;
      page++;
    }
    console.log(`[elinter] ${allInverters.length} inverters found`);

    let totalUpdated = 0;
    const errors = [];

    for (const inv of allInverters) {
      try {
        const sn = inv.sn || inv.serialNumber || '';
        if (!sn) continue;

        const plantId   = inv.plant?.id;
        const plantName = inv.plant?.name || '';

        let site = null;
        if (plantId) {
          const byId = await db.entities.Site.filter({ elinter_plant_id: String(plantId) });
          if (byId.length > 0) site = byId[0];
        }
        if (!site && plantName) {
          const all = await db.entities.Site.list();
          site = all.find(s => s.name?.trim() === plantName.trim()) || null;
          if (site && plantId) {
            await db.entities.Site.update(site.id, { elinter_plant_id: String(plantId) });
          }
        }

        const rtOut = await elGet(token, `/inverter/${sn}/realtime/output`);
        const rtIn  = await elGet(token, `/inverter/${sn}/realtime/input`);

        const acPower = parseFloat(rtOut?.data?.pInv || inv.pac || 0);
        const etoday  = parseFloat(rtOut?.data?.etoday || inv.etoday || 0);
        const etotal  = parseFloat(rtOut?.data?.etotal || inv.etotal || 0);

        const phase_voltages = {
          l1: parseFloat(rtOut?.data?.vac1 || 0),
          l2: parseFloat(rtOut?.data?.vac2 || 0),
          l3: parseFloat(rtOut?.data?.vac3 || 0),
        };

        const pvIV = rtIn?.data?.pvIV || [];
        const mpptStrings = pvIV.map((pv) => ({
          string_id: `PV${pv.pvNo}`,
          voltage_v: parseFloat(pv.vpv || 0),
          current_a: parseFloat(pv.ipv || 0),
          power_kw:  parseFloat(pv.ppv || 0) / 1000
        })).filter(s => s.voltage_v > 0 || s.current_a > 0);

        const totalDcPower = mpptStrings.reduce((s, p) => s + p.power_kw, 0);
        const efficiency   = totalDcPower > 0 ? parseFloat(((acPower / totalDcPower) * 100).toFixed(1)) : 0;
        const devStatus    = inv.status === 1 ? 'online' : inv.status === 2 ? 'warning' : inv.status === 3 ? 'warning' : 'offline';

        const invData = {
          name:                inv.alias || sn,
          model:               inv.model || '',
          rated_power_kw:      0,
          current_ac_power_kw: acPower / 1000,
          current_dc_power_kw: totalDcPower,
          efficiency_percent:  efficiency,
          temperature_c:       null,
          status:              devStatus,
          daily_yield_kwh:     etoday,
          mppt_strings:        mpptStrings,
          phase_voltages,
          elinter_sn:          sn,
        };

        if (site) {
          invData['site_id'] = site.id;
          await db.entities.Site.update(site.id, {
            current_power_kw:   acPower / 1000,
            daily_yield_kwh:    etoday,
            lifetime_yield_kwh: etotal,
            status:             devStatus,
            last_heartbeat:     new Date().toISOString()
          });
          totalUpdated++;
        }

        const existing = await db.entities.Inverter.filter({ elinter_sn: sn });
        if (existing.length > 0) {
          await db.entities.Inverter.update(existing[0].id, invData);
        } else {
          await db.entities.Inverter.create(invData);
        }
        console.log(`[elinter] Inverter ${sn}: AC=${acPower}W strings=${mpptStrings.length}`);

      } catch (e) {
        console.log(`[elinter] Error for inverter ${inv.sn}: ${e.message}`);
        errors.push({ sn: inv.sn, error: e.message });
      }
    }

    return Response.json({
      success:          true,
      inverters_synced: allInverters.length,
      sites_updated:    totalUpdated,
      errors,
      synced_at:        new Date().toISOString()
    });

  } catch (error) {
    console.error('[elinter] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});