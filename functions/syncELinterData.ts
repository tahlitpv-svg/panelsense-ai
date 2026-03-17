import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac } from 'node:crypto';

const ELINTER_BASE = 'http://openapi.inteless.com/v1';
const APP_KEY = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const ELINTER_USERNAME = 'tahlitpv@gmail.com';
const ELINTER_PASSWORD = 'Aa123456';

// Build HMAC-SHA256 signed headers for E-Linter / Inteless API gateway
function buildSignedHeaders(method, path, contentType = '') {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();

  const headersToSign = `x-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}`;
  const stringToSign = [
    method.toUpperCase(),
    '*/*',
    '',
    contentType,
    '',
    headersToSign,
    path
  ].join('\n');

  const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');

  return {
    'Accept': '*/*',
    'Content-Type': contentType || undefined,
    'X-Ca-Key': APP_KEY,
    'X-Ca-Nonce': nonce,
    'X-Ca-Timestamp': timestamp,
    'X-Ca-Signature': sig,
    'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
  };
}

async function elinterLogin(username, password) {
  const formParams = { username, password, grant_type: 'password', client_id: 'csp-web' };
  const sortedKeys = Object.keys(formParams).sort();
  const sortedQuery = sortedKeys.map(k => `${k}=${formParams[k]}`).join('&');
  const pathWithQuery = `/v1/oauth/token?${sortedQuery}`;

  const headers = buildSignedHeaders('POST', pathWithQuery, 'application/x-www-form-urlencoded');

  const body = new URLSearchParams(formParams).toString();
  const res = await fetch(`${ELINTER_BASE}/oauth/token`, {
    method: 'POST',
    headers,
    body
  });

  const text = await res.text();
  if (!text) throw new Error(`E-Linter login: empty response (status ${res.status}), x-ca-error: ${res.headers.get('x-ca-error-message') || 'none'}`);

  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`E-Linter login parse error: ${text.substring(0, 200)}`); }

  if (!data?.access_token) throw new Error(`E-Linter login failed: ${JSON.stringify(data)}`);
  console.log('[elinter] Login OK');
  return data.access_token;
}

async function elGet(token, path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const fullPath = `/v1${path}${query ? '?' + query : ''}`;
  const signedHeaders = buildSignedHeaders('GET', fullPath);
  const url = `${ELINTER_BASE}${path}${query ? '?' + query : ''}`;

  const res = await fetch(url, {
    headers: {
      ...signedHeaders,
      'Authorization': `Bearer ${token}`
    }
  });

  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Get credentials from ApiConnection entity
    const connections = await db.entities.ApiConnection.filter({ provider: 'cesc', is_active: true });
    let username = APP_KEY;
    let password = APP_SECRET;
    if (connections.length > 0 && connections[0].config) {
      username = connections[0].config.app_key || APP_KEY;
      password = connections[0].config.app_secret || APP_SECRET;
    }

    const token = await elinterLogin(username, password);

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

        const plantId = inv.plant?.id;
        const plantName = inv.plant?.name || '';

        let site = null;
        if (plantId) {
          const byId = await db.entities.Site.filter({ cesc_plant_id: String(plantId) });
          if (byId.length > 0) site = byId[0];
        }
        if (!site && plantName) {
          const all = await db.entities.Site.list();
          site = all.find(s => s.name?.trim() === plantName.trim()) || null;
          if (site && plantId) {
            await db.entities.Site.update(site.id, { cesc_plant_id: String(plantId) });
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
          cesc_inverter_sn:    sn,
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