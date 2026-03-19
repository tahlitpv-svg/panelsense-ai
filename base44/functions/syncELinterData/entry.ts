import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

// ── Credentials ───────────────────────────────────────────────────────────────
const APP_KEY    = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME   = 'm.b.g.shilo@gmail.com';
const PASSWORD   = 'Cesc2024';
const LOGIN_URL  = 'http://openapi.inteless.com/oauth/token';
const API_BASE   = 'https://openapi.inteless.com';

// ── Signature ─────────────────────────────────────────────────────────────────
function sign(method: string, path: string, nonce: string, md5: string): string {
  const text = [
    method.toUpperCase(),
    'application/json',
    md5,
    'application/json',
    '',
    `x-ca-key:${APP_KEY}`,
    `x-ca-nonce:${nonce}`,
    path
  ].join('\n');
  return createHmac('sha256', APP_SECRET).update(text).digest('base64');
}

function makeHeaders(method: string, path: string, token?: string, body = ''): Record<string, string> {
  const nonce = crypto.randomUUID();
  const md5   = body ? createHash('md5').update(body).digest('base64') : '';
  const h: Record<string, string> = {
    'Content-Type':           'application/json',
    'Accept':                 'application/json',
    'Content-MD5':            md5,
    'X-Ca-Key':               APP_KEY,
    'X-Ca-Nonce':             nonce,
    'X-Ca-Signature':         sign(method, path, nonce, md5),
    'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(): Promise<string> {
  const body = JSON.stringify({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: 'openapi' });
  const res  = await fetch(LOGIN_URL, { method: 'POST', headers: makeHeaders('POST', '/oauth/token', undefined, body), body });
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
async function elGet(token: string, path: string, params: Record<string, string> = {}) {
  const qs       = new URLSearchParams({ lan: 'en', ...params }).toString();
  const fullPath = `${path}?${qs}`;
  const url      = `${API_BASE}${fullPath}`;
  const res      = await fetch(url, { method: 'GET', headers: makeHeaders('GET', fullPath, token) });
  const text     = await res.text();
  console.log(`[elinter] GET ${path} status=${res.status} body=${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return null; }
}

// ── Helper ────────────────────────────────────────────────────────────────────
function pf(v: any): number { return parseFloat(v) || 0; }

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db     = base44.asServiceRole;

    // 1. Login
    const token = await login();

    // 2. Get all sites that have elinter_plant_id
    const allSites = await db.entities.Site.list();
    const sites    = allSites.filter((s: any) => s.elinter_plant_id);
    console.log(`[elinter] ${sites.length} sites with elinter_plant_id`);

    if (sites.length === 0) {
      // No sites linked yet — try to get plant list and log it for setup
      console.log('[elinter] No sites linked. Trying /v1/plants to discover plant IDs...');
      const plantsRes = await elGet(token, '/v1/plants', { page: '1', limit: '100' });
      console.log('[elinter] /v1/plants response:', JSON.stringify(plantsRes).slice(0, 500));
      return Response.json({ success: false, message: 'No sites with elinter_plant_id. Check logs for plant list.', plants_debug: plantsRes });
    }

    let totalUpdated = 0;
    const errors: any[] = [];

    for (const site of sites) {
      const plantId = String(site.elinter_plant_id);
      console.log(`[elinter] Processing site "${site.name}" plantId=${plantId}`);

      try {
        // 3. Plant detail (power, yield)
        const detailRes = await elGet(token, '/v1/plant/detail', { plantId });
        const detail    = detailRes?.data || detailRes?.result || {};

        const currentPower = pf(detail.pac || detail.power || detail.currentPower || 0);
        const dailyYield   = pf(detail.etoday || detail.dailyEnergy || detail.todayEnergy || 0);
        const monthlyYield = pf(detail.emonth || detail.monthEnergy || 0);
        const totalYield   = pf(detail.etotal || detail.totalEnergy || 0);
        const status       = detail.status === 1 || detail.status === 'normal' ? 'online'
                           : detail.status === 2 || detail.status === 'fault'  ? 'warning'
                           : detail.status === 0 ? 'offline' : 'online';

        await db.entities.Site.update(site.id, {
          current_power_kw:   currentPower / 1000,
          daily_yield_kwh:    dailyYield,
          monthly_yield_kwh:  monthlyYield,
          lifetime_yield_kwh: totalYield,
          status,
          last_heartbeat:     new Date().toISOString()
        });
        totalUpdated++;
        console.log(`[elinter] Site "${site.name}": ${currentPower}W / ${dailyYield}kWh`);

        // 4. Daily power snapshot
        try {
          const now       = new Date();
          const todayKey  = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
          const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).slice(0, 5);
          const snapId    = `el_${plantId}`;
          const powerKw   = parseFloat((currentPower / 1000).toFixed(3));
          const snaps     = await db.entities.SiteGraphSnapshot.filter({ station_id: snapId, date_key: todayKey });

          if (snaps.length > 0) {
            if (powerKw > 0 || snaps[0].data?.length > 0) {
              const pts = (snaps[0].data || []).filter((p: any) => p.time !== timeLabel);
              pts.push({ time: timeLabel, value: powerKw });
              pts.sort((a: any, b: any) => a.time.localeCompare(b.time));
              await db.entities.SiteGraphSnapshot.update(snaps[0].id, { daily_yield_kwh: dailyYield, data: pts });
            }
          } else {
            await db.entities.SiteGraphSnapshot.create({
              station_id:      snapId,
              date_key:        todayKey,
              daily_yield_kwh: dailyYield,
              data:            powerKw > 0 ? [{ time: timeLabel, value: powerKw }] : []
            });
          }
        } catch (e: any) { console.log(`[elinter] Snapshot error: ${e.message}`); }

        // 5. Inverters for this plant
        const invRes  = await elGet(token, '/v1/inverters', { plantId, page: '1', limit: '50' });
        const invList = invRes?.data?.list || invRes?.data || invRes?.result || [];
        console.log(`[elinter] Plant ${plantId}: ${invList.length} inverters`);

        for (const inv of invList) {
          try {
            const sn = String(inv.sn || inv.serialNumber || inv.devSn || '');
            if (!sn) continue;

            // Real-time output (AC power, voltages)
            const rtOutRes = await elGet(token, '/v1/inverter/realtime/output', { sn });
            const rtOut    = rtOutRes?.data || {};

            // Real-time input (DC strings/MPPT)
            const rtInRes  = await elGet(token, '/v1/inverter/realtime/input', { sn });
            const rtIn     = rtInRes?.data || {};

            const acPower  = pf(rtOut.pInv || rtOut.pac || inv.pac || 0);
            const etoday   = pf(rtOut.etoday || inv.etoday || 0);
            const temp     = rtOut.temp !== undefined ? pf(rtOut.temp) : null;

            // MPPT strings
            const pvIV        = rtIn.pvIV || [];
            const mpptStrings = pvIV
              .map((pv: any) => ({
                string_id: `PV${pv.pvNo}`,
                voltage_v: pf(pv.vpv),
                current_a: pf(pv.ipv),
                power_kw:  pf(pv.ppv) / 1000
              }))
              .filter((s: any) => s.voltage_v > 0 || s.current_a > 0);

            const totalDcPower = mpptStrings.reduce((s: number, p: any) => s + p.power_kw, 0);
            const efficiency   = totalDcPower > 0 ? parseFloat(((acPower / totalDcPower) * 100).toFixed(1)) : 0;
            const devStatus    = inv.status === 1 ? 'online' : inv.status === 2 ? 'warning' : 'offline';

            const invData = {
              site_id:             site.id,
              name:                inv.alias || inv.name || sn,
              model:               inv.model || inv.devModel || '',
              rated_power_kw:      pf(inv.ratedPower || 0) / 1000,
              current_ac_power_kw: acPower / 1000,
              current_dc_power_kw: totalDcPower,
              efficiency_percent:  efficiency,
              temperature_c:       temp,
              status:              devStatus,
              daily_yield_kwh:     etoday,
              mppt_strings:        mpptStrings,
              phase_voltages: {
                l1: pf(rtOut.vac1),
                l2: pf(rtOut.vac2),
                l3: pf(rtOut.vac3)
              },
              elinter_sn: sn,
            };

            const existing = await db.entities.Inverter.filter({ elinter_sn: sn });
            if (existing.length > 0) {
              await db.entities.Inverter.update(existing[0].id, invData);
            } else {
              await db.entities.Inverter.create(invData);
            }
            console.log(`[elinter] Inverter ${sn}: AC=${acPower}W DC=${totalDcPower.toFixed(2)}kW strings=${mpptStrings.length} temp=${temp}°C`);

          } catch (e: any) {
            console.log(`[elinter] Inverter error sn=${inv.sn}: ${e.message}`);
            errors.push({ site: site.name, sn: inv.sn, error: e.message });
          }
        }

      } catch (e: any) {
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

  } catch (error: any) {
    console.error('[elinter] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
