import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createHmac, createHash } from "node:crypto";

const BASE_URL = 'https://openapi.inteless.com';
const APP_KEY = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME = 'm.b.g.shilo@gmail.com';
const PASSWORD = 'Cesc2024';

async function elinterLogin() {
  const body = JSON.stringify({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: 'csp-web' });
  const md5 = createHash('md5').update(body).digest('base64');
  const nonce = crypto.randomUUID();
  const path = '/oauth/token';
  const textToSign = `POST\napplication/json\n${md5}\napplication/json\n\nx-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\n${path}`;
  const signature = createHmac('sha256', APP_SECRET).update(textToSign).digest('base64');

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-MD5': md5,
      'X-Ca-Key': APP_KEY,
      'X-Ca-Nonce': nonce,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce',
      'X-Ca-Signature': signature
    },
    body
  });

  const text = await res.text();
  console.log(`[elinter] Login status=${res.status} body=${text.substring(0, 400)}`);
  const data = JSON.parse(text);
  const token = data?.data?.access_token || data?.access_token;
  if (!token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  console.log('[elinter] Login OK');
  return token;
}

function buildSignedHeaders(path) {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const emptyMd5 = createHash('md5').update('').digest('base64');
  const textToSign = `GET\napplication/json\n${emptyMd5}\napplication/json\n\nx-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}\n${path}`;
  const signature = createHmac('sha256', APP_SECRET).update(textToSign).digest('base64');
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-MD5': emptyMd5,
    'X-Ca-Key': APP_KEY,
    'X-Ca-Nonce': nonce,
    'X-Ca-Timestamp': timestamp,
    'X-Ca-Signature': signature,
    'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
  };
}

async function elGet(token, pathWithQuery) {
  const headers = { ...buildSignedHeaders(pathWithQuery), 'Authorization': `Bearer ${token}` };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${BASE_URL}${pathWithQuery}`, { headers, signal: controller.signal });
    clearTimeout(timeout);
    const text = await res.text();
    const errMsg = res.headers.get('x-ca-error-message') || '';
    console.log(`[elinter] GET ${pathWithQuery} → ${res.status} errMsg="${errMsg}" body=${text.substring(0, 500)}`);
    try { return JSON.parse(text); } catch { return null; }
  } catch (e) {
    clearTimeout(timeout);
    console.log(`[elinter] GET ${pathWithQuery} → ERROR: ${e.message}`);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    const token = await elinterLogin();

    // Step 1: Get all plants
    const plantsRes = await elGet(token, '/v1/plants?page=1&limit=100&lan=en');
    const plants = plantsRes?.data?.infos || plantsRes?.data || [];
    console.log(`[elinter] /v1/plants returned ${plants.length} plants. Full response: ${JSON.stringify(plantsRes)}`);

    if (!plants.length) {
      return Response.json({ success: false, message: 'No plants returned', raw: plantsRes });
    }

    let totalUpdated = 0;
    const errors = [];

    for (const plant of plants) {
      const plantId = String(plant.id || plant.plantId || '');
      const plantName = plant.name || '';
      console.log(`[elinter] Processing plant id=${plantId} name="${plantName}"`);

      // Match site
      let site = null;
      if (plantId) {
        const byId = await db.entities.Site.filter({ cesc_plant_id: plantId });
        if (byId.length > 0) site = byId[0];
      }
      if (!site && plantName) {
        const all = await db.entities.Site.list();
        site = all.find(s => s.name?.trim() === plantName.trim()) || null;
        if (site && plantId) {
          await db.entities.Site.update(site.id, { cesc_plant_id: plantId });
        }
      }

      // Step 2: Get inverters for this plant
      const invRes = await elGet(token, `/v1/inverters?plantId=${plantId}&page=1&limit=50&lan=en`);
      const inverters = invRes?.data?.infos || invRes?.data || [];
      console.log(`[elinter] Plant ${plantId}: ${inverters.length} inverters`);

      for (const inv of inverters) {
        try {
          const sn = inv.sn || inv.serialNumber || '';
          if (!sn) continue;

          const rtOut = await elGet(token, `/v1/inverter/${sn}/realtime/output`);
          const rtIn  = await elGet(token, `/v1/inverter/${sn}/realtime/input`);

          const acPower = parseFloat(rtOut?.data?.pInv ?? inv.pac ?? 0);
          const etoday  = parseFloat(rtOut?.data?.etoday ?? inv.etoday ?? 0);
          const etotal  = parseFloat(rtOut?.data?.etotal ?? inv.etotal ?? 0);

          const phase_voltages = {
            l1: parseFloat(rtOut?.data?.vac1 || 0),
            l2: parseFloat(rtOut?.data?.vac2 || 0),
            l3: parseFloat(rtOut?.data?.vac3 || 0),
          };

          const pvIV = rtIn?.data?.pvIV || [];
          const mpptStrings = pvIV.map(pv => ({
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
            cesc_inverter_sn:    sn,
          };

          if (site) {
            invData.site_id = site.id;
            await db.entities.Site.update(site.id, {
              current_power_kw:   acPower / 1000,
              daily_yield_kwh:    etoday,
              lifetime_yield_kwh: etotal,
              status:             devStatus,
              last_heartbeat:     new Date().toISOString()
            });
            totalUpdated++;
          }

          const existing = await db.entities.Inverter.filter({ cesc_inverter_sn: sn });
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
    }

    return Response.json({ success: true, plants_found: plants.length, sites_updated: totalUpdated, errors, synced_at: new Date().toISOString() });

  } catch (error) {
    console.error('[elinter] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});