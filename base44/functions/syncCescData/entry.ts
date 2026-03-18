import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createHmac, createHash } from 'node:crypto';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function cescLogin(appKey, appSecret, username, password) {
  const body = JSON.stringify({ username, password, grant_type: 'password', client_id: 'openapi' });
  const md5 = createHash('md5').update(body).digest('base64');
  const nonce = crypto.randomUUID();
  const path = '/oauth/token';
  const textToSign = `POST\napplication/json\n${md5}\napplication/json\n\nx-ca-key:${appKey}\nx-ca-nonce:${nonce}\n${path}`;
  const signature = createHmac('sha256', appSecret).update(textToSign).digest('base64');

  const res = await fetch(`https://pv.inteless.com${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-MD5': md5,
      'X-Ca-Key': appKey,
      'X-Ca-Nonce': nonce,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce',
      'X-Ca-Signature': signature
    },
    body
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Login parse error: ${text.substring(0, 200)}`); }
  const token = data?.data?.access_token || data?.access_token;
  if (!token) throw new Error(`Login failed: ${JSON.stringify(data).substring(0, 200)}`);
  return token;
}

// ── GET with HMAC signing ─────────────────────────────────────────────────────

function buildGetHeaders(path, appKey, appSecret) {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const emptyMd5 = createHash('md5').update('').digest('base64');
  // Sort query params in path
  const [base, query] = path.split('?');
  const sortedPath = query ? `${base}?${query.split('&').sort().join('&')}` : path;
  const textToSign = `GET\napplication/json\n${emptyMd5}\napplication/json\n\nx-ca-key:${appKey}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}\n${sortedPath}`;
  const signature = createHmac('sha256', appSecret).update(textToSign).digest('base64');
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-MD5': emptyMd5,
    'X-Ca-Key': appKey,
    'X-Ca-Nonce': nonce,
    'X-Ca-Timestamp': timestamp,
    'X-Ca-Signature': signature,
    'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
  };
}

async function cescGet(token, path, appKey, appSecret) {
  const headers = { ...buildGetHeaders(path, appKey, appSecret), 'Authorization': `Bearer ${token}` };
  const res = await fetch(`https://pv.inteless.com/api${path}`, { headers });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

// ── Sync ──────────────────────────────────────────────────────────────────────

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

        const token = await cescLogin(app_key, app_secret, user_account, user_password);

        // Get all plants (paginated)
        let page = 1;
        const allPlants = [];
        while (true) {
          const res = await cescGet(token, `/v1/plants?page=${page}&limit=50`, app_key, app_secret);
          const infos = res?.data?.infos || [];
          allPlants.push(...infos);
          if (infos.length < 50) break;
          page++;
        }
        console.log(`[syncCesc] ${allPlants.length} plants found`);

        for (const plant of allPlants) {
          const plantId = String(plant.id);
          const plantName = plant.name || '';

          // Find matching site
          let site = null;
          const byPlantId = await db.entities.Site.filter({ cesc_plant_id: plantId });
          if (byPlantId.length > 0) {
            site = byPlantId[0];
          } else {
            const allSites = await db.entities.Site.list();
            site = allSites.find(s => s.name?.trim() === plantName.trim()) || null;
            if (site && plantId) {
              await db.entities.Site.update(site.id, { cesc_plant_id: plantId, cesc_connection_id: conn.id });
            }
          }

          // Get inverters for this plant
          const invRes = await cescGet(token, `/v1/plants/${plantId}/inverters?page=1&limit=50`, app_key, app_secret);
          const inverters = invRes?.data?.infos || invRes?.data || [];
          console.log(`[syncCesc] Plant ${plantName} (${plantId}): ${inverters.length} inverters`);

          let totalAcPower = 0;
          let totalDailyYield = 0;
          let anyOnline = false;

          for (const inv of inverters) {
            const sn = inv.sn;
            if (!sn) continue;

            // Realtime data
            const realtimeRes = await cescGet(token, `/v1/inverter/${sn}/realtime/input`, app_key, app_secret);
            const outputRes = await cescGet(token, `/v1/inverter/${sn}/realtime/output`, app_key, app_secret);

            const etoday = parseFloat(realtimeRes?.data?.etoday || 0);
            const pac = parseFloat(realtimeRes?.data?.pac || 0); // W
            const pvIV = realtimeRes?.data?.pvIV || [];

            const vac1 = parseFloat(outputRes?.data?.vac1 || 0);
            const vac2 = parseFloat(outputRes?.data?.vac2 || 0);
            const vac3 = parseFloat(outputRes?.data?.vac3 || 0);

            const mpptStrings = pvIV.map(pv => ({
              string_id: `PV${pv.pvNo}`,
              voltage_v: parseFloat(pv.vpv || 0),
              current_a: parseFloat(pv.ipv || 0),
              power_kw: parseFloat(pv.ppv || 0) / 1000
            })).filter(s => s.voltage_v > 0 || s.current_a > 0);

            const dcPowerKw = mpptStrings.reduce((s, p) => s + p.power_kw, 0);
            const acPowerKw = pac / 1000;

            const statusMap = { 0: 'offline', 1: 'online', 2: 'warning', 3: 'warning', 4: 'warning' };
            const invStatus = statusMap[inv.status] || 'offline';
            if (invStatus === 'online') anyOnline = true;

            totalAcPower += acPowerKw;
            totalDailyYield += etoday;

            const invData = {
              site_id: site?.id || '',
              name: inv.alias || sn,
              model: inv.model || '',
              current_ac_power_kw: parseFloat(acPowerKw.toFixed(3)),
              current_dc_power_kw: parseFloat(dcPowerKw.toFixed(3)),
              efficiency_percent: dcPowerKw > 0 ? parseFloat(((acPowerKw / dcPowerKw) * 100).toFixed(1)) : 0,
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
          }

          if (site) {
            const siteStatus = anyOnline ? 'online' : 'offline';
            await db.entities.Site.update(site.id, {
              current_power_kw: parseFloat(totalAcPower.toFixed(3)),
              daily_yield_kwh: parseFloat(totalDailyYield.toFixed(3)),
              status: siteStatus,
              last_heartbeat: new Date().toISOString(),
              cesc_connection_id: conn.id
            });

            // Graph snapshot
            try {
              const now = new Date();
              const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
              const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).slice(0, 5);
              const snapId = `cesc_${plantId}`;
              const snaps = await db.entities.SiteGraphSnapshot.filter({ station_id: snapId, date_key: todayKey });
              if (snaps.length > 0) {
                const pts = (snaps[0].data || []).filter(p => p.time !== timeLabel);
                if (totalAcPower > 0) pts.push({ time: timeLabel, value: parseFloat(totalAcPower.toFixed(3)) });
                pts.sort((a, b) => a.time.localeCompare(b.time));
                await db.entities.SiteGraphSnapshot.update(snaps[0].id, { daily_yield_kwh: totalDailyYield, data: pts });
              } else {
                await db.entities.SiteGraphSnapshot.create({
                  station_id: snapId,
                  date_key: todayKey,
                  daily_yield_kwh: totalDailyYield,
                  data: totalAcPower > 0 ? [{ time: timeLabel, value: parseFloat(totalAcPower.toFixed(3)) }] : []
                });
              }
            } catch (e) { console.log(`[syncCesc] Snapshot error: ${e.message}`); }

            totalUpdated++;
            console.log(`[syncCesc] Site "${site.name}": AC=${totalAcPower.toFixed(2)}kW daily=${totalDailyYield.toFixed(1)}kWh`);
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