import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createHmac, createHash } from 'node:crypto';

// ── Credentials ───────────────────────────────────────────────────────────────
const APP_KEY    = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME   = 'm.b.g.shilo@gmail.com';
const PASSWORD   = 'Cesc2024';
const LOGIN_URL  = 'http://openapi.inteless.com/oauth/token';
const API_BASE   = 'https://openapi.inteless.com';

// ── Signature ─────────────────────────────────────────────────────────────────
// Alibaba Cloud API Gateway signature:
// The "path" in the string-to-sign must include query params, sorted alphabetically.
// Query params are NOT included in the path segment — they go separately after \n.
function sign(method, basePath, queryParams, nonce, md5) {
  // Sort query params alphabetically and append to path
  const sortedQs = Object.keys(queryParams).sort()
    .map(k => `${k}:${queryParams[k]}`)
    .join('\n');
  const text = [
    method.toUpperCase(),
    'application/json',
    md5,
    'application/json',
    '',
    `x-ca-key:${APP_KEY}`,
    `x-ca-nonce:${nonce}`,
    basePath + (sortedQs ? `\n${sortedQs}` : '')
  ].join('\n');
  return createHmac('sha256', APP_SECRET).update(text).digest('base64');
}

function makeHeaders(method, basePath, queryParams, token, body = '') {
  const nonce = crypto.randomUUID();
  const md5   = body ? createHash('md5').update(body).digest('base64') : '';
  const h = {
    'Content-Type':           'application/json',
    'Accept':                 'application/json',
    'Content-MD5':            md5,
    'X-Ca-Key':               APP_KEY,
    'X-Ca-Nonce':             nonce,
    'X-Ca-Signature':         sign(method, basePath, queryParams || {}, nonce, md5),
    'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login() {
  const body = JSON.stringify({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: 'openapi' });
  const res  = await fetch(LOGIN_URL, { method: 'POST', headers: makeHeaders('POST', '/oauth/token', {}, undefined, body), body });
  const text = await res.text();
  console.log(`[elinter] login status=${res.status} body=${text.slice(0, 300)}`);
  if (!text || text.startsWith('<')) throw new Error(`Login failed: status=${res.status}`);
  const data  = JSON.parse(text);
  const token = data?.data?.access_token || data?.access_token;
  if (!token) throw new Error(`No token: ${JSON.stringify(data)}`);
  console.log('[elinter] Login OK');
  return token;
}

// ── GET with signature ────────────────────────────────────────────────────────
async function elGet(token, path, params = {}) {
  const allParams = { ...params, lan: 'en' };
  const qs        = new URLSearchParams(allParams).toString();
  const fullUrl   = `${API_BASE}${path}?${qs}`;
  const hdrs      = makeHeaders('GET', path, allParams, token);
  console.log(`[elinter] GET ${path}?${qs}`);
  const res       = await fetch(fullUrl, { method: 'GET', headers: hdrs });
  const text      = await res.text();
  const parsed    = (() => { try { return JSON.parse(text); } catch { return null; } })();
  console.log(`[elinter] → ${res.status} msg="${parsed?.msg || ''}" body=${text.slice(0, 300)}`);
  return parsed;
}

function pf(v) { return parseFloat(v) || 0; }

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db     = base44.asServiceRole;

    // 1. Login
    const token = await login();

    // 2. Get all sites that have cesc_plant_id
    const allSites = await db.entities.Site.list();
    const sites    = allSites.filter(s => s.cesc_plant_id);
    console.log(`[elinter] ${sites.length} sites with cesc_plant_id`);

    if (sites.length === 0) {
      return Response.json({ success: false, message: 'No sites with cesc_plant_id found.' });
    }

    let totalUpdated = 0;
    const errors = [];
    let currentToken = token;
    let tokenRefreshCount = 0;

    for (const site of sites) {
      const plantId = String(site.cesc_plant_id);
      console.log(`[elinter] Processing plant id=${plantId} site="${site.name}"`);

      try {
        // 3. Inverters list for this plant
        const invRes  = await elGet(currentToken, '/v1/inverters', { plantId, page: '1', limit: '50' });
        // If 403, try refreshing the token once
        if (!invRes || (invRes?.code !== 0 && invRes?.code !== undefined) || (invRes === null)) {
          console.log(`[elinter] Token may have expired, refreshing...`);
          currentToken = await login();
          tokenRefreshCount++;
        }
        const invRes2 = invRes?.data?.infos ? invRes : await elGet(currentToken, '/v1/inverters', { plantId, page: '1', limit: '50' });
        const invList = invRes2?.data?.infos || invRes2?.data?.list || invRes?.data?.infos || invRes?.data?.list || [];
        console.log(`[elinter] Plant ${plantId}: ${invList.length} inverters`);

        let sitePower  = 0;
        let siteEtoday = 0;
        let siteEtotal = 0;

        for (const inv of invList) {
          const sn = String(inv.sn || inv.serialNumber || '');
          if (!sn) continue;

          // Real-time output (AC power, phase voltages) — /input returns 403
          const rtOut = await elGet(currentToken, `/v1/inverter/${sn}/realtime/output`);

          const acPowerW = pf(rtOut?.data?.pInv ?? rtOut?.data?.pac ?? inv.pac ?? 0);
          const acPower  = acPowerW / 1000; // W → kW
          const etoday   = pf(rtOut?.data?.etoday ?? inv.etoday ?? 0);
          const etotal   = pf(rtOut?.data?.etotal ?? inv.etotal ?? 0);

          // vip = [{volt, current, power}, ...] for L1/L2/L3
          const vip = rtOut?.data?.vip || [];
          const phase_voltages = {
            l1: pf(vip[0]?.volt),
            l2: pf(vip[1]?.volt),
            l3: pf(vip[2]?.volt),
          };

          const devStatus = inv.status === 1 ? 'online' : inv.status === 2 ? 'warning' : inv.status === 3 ? 'warning' : 'offline';

          sitePower  += acPower;
          siteEtoday += etoday;
          siteEtotal  = Math.max(siteEtotal, etotal);

          const invData = {
            site_id:             site.id,
            name:                inv.alias || sn,
            model:               inv.model || '',
            rated_power_kw:      0,
            current_ac_power_kw: acPower,
            current_dc_power_kw: acPower, // no /input access
            efficiency_percent:  0,
            temperature_c:       null,
            status:              devStatus,
            daily_yield_kwh:     etoday,
            mppt_strings:        [],
            phase_voltages,
            cesc_inverter_sn:    sn,
          };

          const existing = await db.entities.Inverter.filter({ cesc_inverter_sn: sn });
          if (existing.length > 0) {
            await db.entities.Inverter.update(existing[0].id, invData);
          } else {
            await db.entities.Inverter.create(invData);
          }
          console.log(`[elinter] Inverter ${sn}: AC=${acPower.toFixed(2)}kW etoday=${etoday}kWh`);
        }

        // 4. Update site
        await db.entities.Site.update(site.id, {
          current_power_kw:   sitePower,
          daily_yield_kwh:    siteEtoday,
          lifetime_yield_kwh: siteEtotal,
          status:             sitePower > 0 ? 'online' : 'offline',
          last_heartbeat:     new Date().toISOString()
        });
        totalUpdated++;
        console.log(`[elinter] Site "${site.name}": power=${sitePower.toFixed(2)}kW daily=${siteEtoday}kWh`);

        // 5. Daily power snapshot
        try {
          const now       = new Date();
          const todayKey  = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
          const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).slice(0, 5);
          const snapId    = `el_${plantId}`;
          const powerKw   = parseFloat(sitePower.toFixed(3));
          const snaps     = await db.entities.SiteGraphSnapshot.filter({ station_id: snapId, date_key: todayKey });

          if (snaps.length > 0) {
            const pts = (snaps[0].data || []).filter(p => p.time !== timeLabel);
            if (powerKw > 0 || pts.length > 0) {
              if (powerKw > 0) pts.push({ time: timeLabel, value: powerKw });
              pts.sort((a, b) => a.time.localeCompare(b.time));
              await db.entities.SiteGraphSnapshot.update(snaps[0].id, { daily_yield_kwh: siteEtoday, data: pts });
            }
          } else if (powerKw > 0) {
            await db.entities.SiteGraphSnapshot.create({
              station_id:      snapId,
              date_key:        todayKey,
              daily_yield_kwh: siteEtoday,
              data:            [{ time: timeLabel, value: powerKw }]
            });
          }
        } catch (e) { console.log(`[elinter] Snapshot error: ${e.message}`); }

      } catch (e) {
        console.error(`[elinter] Site error "${site.name}": ${e.message}`);
        errors.push({ site: site.name, error: e.message });
      }
    }

    return Response.json({
      success:       true,
      sites_synced:  sites.length,
      sites_updated: totalUpdated,
      errors,
      synced_at:     new Date().toISOString()
    });

  } catch (error) {
    console.error('[elinter] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});