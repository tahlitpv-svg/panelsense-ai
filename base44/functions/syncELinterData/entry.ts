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
  console.log(`[elinter] Login status=${res.status} body=${text.substring(0, 300)}`);
  const data = JSON.parse(text);
  const token = data?.data?.access_token || data?.access_token;
  if (!token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  console.log('[elinter] Login OK');
  return token;
}

function buildSignedHeaders(pathWithQuery) {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const emptyMd5 = createHash('md5').update('').digest('base64');
  // Sort query params for signature
  const [base, query] = pathWithQuery.split('?');
  const sortedPath = query
    ? `${base}?${query.split('&').sort().join('&')}`
    : pathWithQuery;
  const textToSign = `GET\napplication/json\n${emptyMd5}\napplication/json\n\nx-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}\n${sortedPath}`;
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
    console.log(`[elinter] GET ${pathWithQuery} → ${res.status} errMsg="${errMsg}" body=${text.substring(0, 400)}`);
    try { return JSON.parse(text); } catch { return null; }
  } catch (e) {
    clearTimeout(timeout);
    console.log(`[elinter] GET ${pathWithQuery} → TIMEOUT/ERROR: ${e.message}`);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    const token = await elinterLogin();

    // Get all CESC sites from DB (those with cesc_plant_id set)
    const allSites = await db.entities.Site.list();
    const cescSites = allSites.filter(s => s.cesc_plant_id);
    console.log(`[elinter] Found ${cescSites.length} CESC sites in DB`);

    if (!cescSites.length) {
      return Response.json({ success: false, message: 'No sites with cesc_plant_id found in DB' });
    }

    let totalUpdated = 0;
    const errors = [];

    for (const site of cescSites) {
      const plantId = site.cesc_plant_id;
      console.log(`[elinter] Processing plant id=${plantId} site="${site.name}"`);

      // Get inverters for this plant
      const invRes = await elGet(token, `/v1/inverters?plantId=${plantId}&page=1&limit=50&lan=en`);
      const inverters = invRes?.data?.infos || invRes?.data || [];
      console.log(`[elinter] Plant ${plantId}: ${inverters.length} inverters`);

      if (!inverters.length) continue;

      let sitePower = 0, siteEtoday = 0, siteEtotal = 0;
      let siteStatus = 'offline';

      for (const inv of inverters) {
        try {
          const sn = inv.sn || inv.serialNumber || '';
          if (!sn) continue;

          const rtOut = await elGet(token, `/v1/inverter/${sn}/realtime/output`);

          const acPowerW = parseFloat(rtOut?.data?.pInv ?? rtOut?.data?.pac ?? inv.pac ?? 0);
          const acPower  = acPowerW / 1000; // convert W → kW
          const etoday   = parseFloat(rtOut?.data?.etoday ?? inv.etoday ?? 0);
          const etotal   = parseFloat(rtOut?.data?.etotal ?? inv.etotal ?? 0);

          // vip = [{volt, current, power}, ...] for L1/L2/L3
          const vip = rtOut?.data?.vip || [];
          const phase_voltages = {
            l1: parseFloat(vip[0]?.volt || 0),
            l2: parseFloat(vip[1]?.volt || 0),
            l3: parseFloat(vip[2]?.volt || 0),
          };

          // /realtime/input is 403 (no permission) — skip
          const mpptStrings = [];

          const devStatus    = inv.status === 1 ? 'online' : inv.status === 2 ? 'warning' : inv.status === 3 ? 'warning' : 'offline';

          sitePower  += acPower;
          siteEtoday += etoday;
          siteEtotal  = Math.max(siteEtotal, etotal);
          if (devStatus === 'online') siteStatus = 'online';
          else if (devStatus === 'warning' && siteStatus !== 'online') siteStatus = 'warning';

          const invData = {
            site_id:             site.id,
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

      // Update site totals
      await db.entities.Site.update(site.id, {
        current_power_kw:   sitePower,
        daily_yield_kwh:    siteEtoday,
        lifetime_yield_kwh: siteEtotal,
        status:             siteStatus,
        last_heartbeat:     new Date().toISOString()
      });
      totalUpdated++;
      console.log(`[elinter] Site "${site.name}": power=${sitePower.toFixed(2)}kW daily=${siteEtoday}kWh`);
    }

    return Response.json({ success: true, sites_synced: cescSites.length, sites_updated: totalUpdated, errors, synced_at: new Date().toISOString() });

  } catch (error) {
    console.error('[elinter] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});