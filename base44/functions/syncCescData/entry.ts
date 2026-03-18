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

        const existingSites = await db.entities.Site.list();
        
        // Let's do pagination over the plants locally to avoid lambda timeouts
        const chunkSize = 15;
        let pidx = 0;
        try {
          const body = await req.json();
          if (body.startIdx) pidx = body.startIdx;
        } catch (_) {}

        const chunk = allPlants.slice(pidx, pidx + chunkSize);
        console.log(`[syncCesc] Processing plants ${pidx} to ${pidx + chunk.length} of ${allPlants.length}`);

        for (const plant of chunk) {
           const plantId = String(plant.id);
           const plantName = plant.name || '';

           // Find matching site
           let site = existingSites.find(s => s.cesc_plant_id === plantId) || null;
           if (!site) {
             site = existingSites.find(s => s.name?.trim() === plantName.trim()) || null;
             if (site && plantId) {
               await db.entities.Site.update(site.id, { cesc_plant_id: plantId, cesc_connection_id: conn.id });
             }
           }

           // Plant data is directly available from the plants endpoint
           const totalAcPower = parseFloat(plant.pac || 0) / 1000; // pac is in W
           const totalDailyYield = parseFloat(plant.etoday || 0);
           const plantStatus = plant.status === 0 ? 'offline' : 'online'; // 0=offline, 1+=online

           if (site) {
             // Get device details (inverters)
             const devRes = await cescGet(token, `/v1/plants/${plantId}/devices`, app_key, app_secret);
             const devices = devRes?.data?.infos || [];
             const inverters = devices.filter(d => d.device_type === 1); // 1 = inverter

             // Sync inverters with detailed data
             for (let i = 0; i < inverters.length; i++) {
               const inv = inverters[i];
               const detailRes = await cescGet(token, `/v1/devices/${inv.id}/real-time`, app_key, app_secret);
               const detail = detailRes?.data || {};

               // Create/update inverter record - match by site_id + cesc_inverter_sn
               const existingInv = (await db.entities.Inverter.filter({ site_id: site.id, cesc_inverter_sn: inv.sn }))?.[0];
               // Build MPPT strings from detail (e.g. pv1_u, pv1_i, pv1_p)
               const mpptStrings = [];
               for (let j = 1; j <= 10; j++) {
                 const uKey = `pv${j}_u`, iKey = `pv${j}_i`, pKey = `pv${j}_p`;
                 const voltage = parseFloat(detail[uKey]);
                 const current = parseFloat(detail[iKey]);
                 const power = parseFloat(detail[pKey]);
                 if (!isNaN(voltage) || !isNaN(current) || !isNaN(power)) {
                   mpptStrings.push({
                     string_id: `PV${j}`,
                     voltage_v: isNaN(voltage) ? 0 : voltage,
                     current_a: isNaN(current) ? 0 : current,
                     power_kw: isNaN(power) ? 0 : power / 1000
                   });
                 }
               }

               let temp = parseFloat(detail.temp_igbt);
               if (isNaN(temp)) temp = parseFloat(detail.temp_ambient);

               const invData = {
                 site_id: site.id,
                 name: inv.name || `Inverter_${inv.sn}`,
                 cesc_inverter_sn: inv.sn,
                 status: inv.status === 0 ? 'offline' : 'online',
                 current_ac_power_kw: (parseFloat(detail.pac) || 0) / 1000,
                 current_dc_power_kw: (parseFloat(detail.pdc) || 0) / 1000,
                 daily_yield_kwh: parseFloat(detail.etoday) || 0,
                 mppt_strings: mpptStrings
               };
               
               if (!isNaN(temp)) invData.temperature_c = temp;
               
               const l1 = parseFloat(detail.vol_a);
               const l2 = parseFloat(detail.vol_b);
               const l3 = parseFloat(detail.vol_c);
               if (!isNaN(l1) || !isNaN(l2) || !isNaN(l3)) {
                 invData.phase_voltages = {
                   l1: isNaN(l1) ? 0 : l1,
                   l2: isNaN(l2) ? 0 : l2,
                   l3: isNaN(l3) ? 0 : l3
                 };
               } else {
                 invData.phase_voltages = { l1: 0, l2: 0, l3: 0 };
               }

               try {
                 if (existingInv) {
                   await db.entities.Inverter.update(existingInv.id, invData);
                 } else {
                   await db.entities.Inverter.create(invData);
                 }
               } catch (invErr) {
                 console.log(`[syncCesc] Failed to save inverter ${inv.sn}:`, invErr.message);
               }
             }

             await db.entities.Site.update(site.id, {
               current_power_kw: parseFloat(totalAcPower.toFixed(3)),
               daily_yield_kwh: parseFloat(totalDailyYield.toFixed(3)),
               status: plantStatus,
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
        
        if (pidx + chunkSize < allPlants.length) {
          base44.asServiceRole.functions.invoke('syncCescData', { startIdx: pidx + chunkSize }).catch(() => {});
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