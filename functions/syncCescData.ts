import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac } from 'node:crypto';

const BASE_URL = 'http://openapi.inteless.com/v1';

function buildCescHeaders(method, path, appKey, appSecret, contentType = '', queryParams = {}) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();

  // Sort query params alphabetically and build URL string
  const sortedKeys = Object.keys(queryParams).sort();
  const urlStr = sortedKeys.length > 0
    ? path + '?' + sortedKeys.map(k => `${k}=${queryParams[k]}`).join('&')
    : path;

  // Format discovered from server error response:
  // METHOD#Accept#ContentMD5#ContentType#Date#x-ca-key:val#x-ca-nonce:val#x-ca-timestamp:val#/path?params
  const stringToSign = [
    method.toUpperCase(),
    '*/*',          // Accept
    '',             // Content-MD5 (empty)
    contentType,    // Content-Type (empty for GET, set for POST)
    '',             // Date (empty)
    `x-ca-key:${appKey}`,
    `x-ca-nonce:${nonce}`,
    `x-ca-timestamp:${timestamp}`,
    urlStr
  ].join('#');

  const signature = createHmac('sha256', appSecret).update(stringToSign, 'utf8').digest('base64');

  return {
    'Accept': '*/*',
    'X-Ca-Key': appKey,
    'X-Ca-Signature': signature,
    'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
    'X-Ca-Timestamp': timestamp,
    'X-Ca-Nonce': nonce,
  };
}

async function cescLogin(appKey, appSecret, username, password) {
  const body = new URLSearchParams({
    username,
    password,
    grant_type: 'password',
    client_id: 'csp-web'
  });

  // Form params must be included in the path for signing (as query string)
  const formParamsSorted = `client_id=csp-web&grant_type=password&password=${password}&username=${username}`;
  const path = `/oauth/token?${formParamsSorted}`;
  const headers = buildCescHeaders('POST', path, appKey, appSecret, 'application/x-www-form-urlencoded');
  headers['Content-Type'] = 'application/x-www-form-urlencoded';

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers,
    body: body.toString()
  });

  const data = await res.json();
  console.log(`[cescLogin] status=${res.status} code=${data?.code}`);
  if (!data?.access_token) throw new Error(`Login failed: ${data?.message || JSON.stringify(data)}`);
  return data.access_token;
}

async function cescGet(path, accessToken, appKey, appSecret, queryParams = {}) {
  const queryStr = Object.keys(queryParams).sort().map(k => `${k}=${queryParams[k]}`).join('&');
  const fullPath = queryStr ? `${path}?${queryStr}` : path;

  const headers = buildCescHeaders('GET', fullPath, appKey, appSecret, '');
  headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}${fullPath}`, { method: 'GET', headers });
  try { return await res.json(); } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const connections = await db.entities.ApiConnection.filter({ provider: 'cesc' });
    if (!connections.length) return Response.json({ success: true, message: 'No cesc connections', synced: 0 });

    let totalUpdated = 0;
    const errors = [];

    for (const conn of connections) {
      try {
        const { app_key, app_secret, user_account, user_password } = conn.config || {};
        if (!app_key || !app_secret || !user_account || !user_password) {
          throw new Error('Missing credentials: app_key, app_secret, user_account, user_password');
        }

        const accessToken = await cescLogin(app_key, app_secret, user_account, user_password);

        // Get inverter list
        const listRes = await cescGet('/inverters', accessToken, app_key, app_secret, { page: 1, limit: 200, type: -1 });
        console.log(`[syncCesc] inverter list code=${listRes?.code}`);

        const inverters = listRes?.data || [];
        console.log(`[syncCesc] ${inverters.length} inverters`);

        for (const inv of inverters) {
          const sn = inv.sn;
          if (!sn) continue;

          // Get realtime input data (DC)
          const inputRes = await cescGet(`/inverter/${sn}/realtime/input`, accessToken, app_key, app_secret);
          // Get realtime output data (AC)
          const outputRes = await cescGet(`/inverter/${sn}/realtime/output`, accessToken, app_key, app_secret);

          const etoday = parseFloat(inputRes?.data?.etoday || 0);
          const etotal = parseFloat(inputRes?.data?.etotal || 0);
          const pac = parseFloat(inputRes?.data?.pac || 0); // AC active power kW
          const pvIV = inputRes?.data?.pvIV || [];

          const vac1 = parseFloat(outputRes?.data?.vac1 || 0);
          const vac2 = parseFloat(outputRes?.data?.vac2 || 0);
          const vac3 = parseFloat(outputRes?.data?.vac3 || 0);
          const iac1 = parseFloat(outputRes?.data?.iac1 || 0);
          const iac2 = parseFloat(outputRes?.data?.iac2 || 0);
          const iac3 = parseFloat(outputRes?.data?.iac3 || 0);

          // Build MPPT strings from pvIV array
          const mpptStrings = pvIV.map(pv => ({
            string_id: `PV${pv.pvNo}`,
            voltage_v: parseFloat(pv.vpv || 0),
            current_a: parseFloat(pv.ipv || 0),
            power_kw: parseFloat(pv.ppv || 0) / 1000
          })).filter(s => s.voltage_v > 0 || s.current_a > 0);

          const totalDcPower = mpptStrings.reduce((s, p) => s + p.power_kw, 0);
          const acPowerKw = pac / 1000; // API returns W

          // Map status
          const statusMap = { 0: 'offline', 1: 'online', 2: 'warning', 3: 'warning', 4: 'warning' };
          const invStatus = statusMap[inv.status] || 'offline';

          // Find matching site by plant name or cesc_inverter_sn
          let site = null;
          const plantName = inv.plant?.name || '';
          const plantId = String(inv.plant?.id || '');

          // Try find site by cesc plant id
          const byPlantId = await db.entities.Site.filter({ cesc_plant_id: plantId });
          if (byPlantId.length > 0) {
            site = byPlantId[0];
          } else if (plantName) {
            const allSites = await db.entities.Site.list();
            site = allSites.find(s => s.name?.trim() === plantName.trim()) || null;
            if (site && plantId) {
              await db.entities.Site.update(site.id, { cesc_plant_id: plantId, cesc_connection_id: conn.id });
            }
          }

          if (!site) {
            console.log(`[syncCesc] No site found for inverter ${sn} (plant: ${plantName})`);
            // Still save inverter data even without site match
          }

          // Upsert inverter
          const invData = {
            site_id: site?.id || '',
            name: inv.alias || sn,
            model: inv.model || '',
            current_ac_power_kw: acPowerKw,
            current_dc_power_kw: totalDcPower,
            efficiency_percent: totalDcPower > 0 ? parseFloat(((acPowerKw / totalDcPower) * 100).toFixed(1)) : 0,
            status: invStatus,
            daily_yield_kwh: etoday,
            mppt_strings: mpptStrings,
            phase_voltages: { l1: vac1, l2: vac2, l3: vac3 },
            cesc_inverter_sn: sn
          };

          const existing = await db.entities.Inverter.filter({ cesc_inverter_sn: sn });
          if (existing.length > 0) {
            await db.entities.Inverter.update(existing[0].id, invData);
          } else {
            await db.entities.Inverter.create(invData);
          }

          // Update site if found
          if (site) {
            const siteInverters = await db.entities.Inverter.filter({ site_id: site.id });
            const totalPower = siteInverters.reduce((s, i) => s + (i.current_ac_power_kw || 0), 0) + acPowerKw;
            const totalDaily = siteInverters.reduce((s, i) => s + (i.daily_yield_kwh || 0), 0) + etoday;

            await db.entities.Site.update(site.id, {
              current_power_kw: parseFloat(totalPower.toFixed(3)),
              daily_yield_kwh: parseFloat(totalDaily.toFixed(3)),
              status: invStatus,
              last_heartbeat: new Date().toISOString(),
              cesc_connection_id: conn.id
            });

            // Snapshot
            try {
              const now = new Date();
              const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
              const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).slice(0, 5);
              const snapId = `cesc_${plantId || sn}`;
              const snaps = await db.entities.SiteGraphSnapshot.filter({ station_id: snapId, date_key: todayKey });
              if (snaps.length > 0) {
                const pts = (snaps[0].data || []).filter(p => p.time !== timeLabel);
                if (acPowerKw > 0) pts.push({ time: timeLabel, value: parseFloat(acPowerKw.toFixed(3)) });
                pts.sort((a, b) => a.time.localeCompare(b.time));
                await db.entities.SiteGraphSnapshot.update(snaps[0].id, { daily_yield_kwh: etoday, data: pts });
              } else {
                await db.entities.SiteGraphSnapshot.create({
                  station_id: snapId,
                  date_key: todayKey,
                  daily_yield_kwh: etoday,
                  data: acPowerKw > 0 ? [{ time: timeLabel, value: parseFloat(acPowerKw.toFixed(3)) }] : []
                });
              }
            } catch (e) { console.log(`[syncCesc] Snapshot error: ${e.message}`); }

            totalUpdated++;
            console.log(`[syncCesc] Site "${site.name}" / Inverter ${sn}: AC=${acPowerKw.toFixed(2)}kW daily=${etoday}kWh`);
          }
        }

        await db.entities.ApiConnection.update(conn.id, {
          status: 'connected',
          last_sync: new Date().toISOString(),
          error_message: null
        });

      } catch (e) {
        console.error(`[syncCesc] Conn ${conn.id} error: ${e.message}`);
        errors.push({ connection_id: conn.id, error: e.message });
        await db.entities.ApiConnection.update(conn.id, { status: 'error', error_message: e.message }).catch(() => {});
      }
    }

    return Response.json({ success: true, connections_synced: connections.length, sites_updated: totalUpdated, errors });

  } catch (error) {
    console.error('[syncCesc] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});