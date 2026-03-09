import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

async function sungrowLogin(config) {
  const baseUrl = (config.base_url || 'https://gateway.isolarcloud.eu').replace(/\/$/, '');
  
  if (config.auth_method === 'oauth2' && config.oauth_access_token) {
    return { token: config.oauth_access_token, user_id: config.oauth_user_id || '', base_url: config.oauth_base_url || baseUrl };
  }

  const candidates = [baseUrl, 'https://gateway.isolarcloud.eu', 'https://gateway.isolarcloud.com.hk'];
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}/openapi/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
        body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
      });
      const data = JSON.parse(await res.text());
      if (data?.result_data?.token) return { token: data.result_data.token, user_id: data.result_data.user_id, base_url: url };
    } catch(e) {}
  }
  throw new Error('Sungrow login failed');
}

async function sungrowPost(base_url, path, config, token, user_id, body = {}) {
  const fullBody = { appkey: config.app_key, token, user_id, req_serial_num: Date.now().toString(36), ...body };
  const res = await fetch(`${base_url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify(fullBody)
  });
  try { return JSON.parse(await res.text()); } catch(e) { return null; }
}

function parseField(field) {
  if (!field && field !== 0) return 0;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const num = parseFloat(field.value) || 0;
    const unit = (field.unit || '').toLowerCase();
    if (unit === 'mwh') return num * 1000;
    if (unit === 'gwh') return num * 1000000;
    if (unit === 'w') return num / 1000;
    return num;
  }
  return parseFloat(field) || 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const db = base44.asServiceRole;

    const connections = await db.entities.ApiConnection.filter({ provider: 'sungrow' });
    if (!connections.length) return Response.json({ success: true, message: 'No Sungrow connections' });

    let totalCreated = 0;
    let totalSkipped = 0;
    const errors = [];

    for (const conn of connections) {
      try {
        const { token, user_id, base_url } = await sungrowLogin(conn.config);

        // Get all stations
        const listRes = await sungrowPost(base_url, '/openapi/getPowerStationList', conn.config, token, user_id, { curPage: 1, size: 200 });
        const stations = listRes?.result_data?.pageList || listRes?.result_data?.list || [];

        // Get sites linked to Sungrow
        const allSites = await db.entities.Site.list();
        const sungrowSites = allSites.filter(s => s.sungrow_station_id);

        // Get existing snapshots
        const existingSnaps = await db.entities.SiteGraphSnapshot.list('-created_date', 10000);
        const existingKeys = new Set(existingSnaps.map(s => `${s.station_id}__${s.date_key}`));

        for (const site of sungrowSites) {
          const psId = site.sungrow_station_id;
          const snapStationId = `sg_${psId}`;
          const station = stations.find(s => String(s.ps_id) === psId);
          if (!station) continue;

          // Try endpoints that might return historical daily energy data
          // Endpoint: getPowerStationDayEnergy or similar
          const endpoints = [
            { path: '/openapi/getPsListStatisticsData', body: { ps_id: psId, stat_type: '2' } }, // type 2 = daily
            { path: '/openapi/queryPsProfit', body: { ps_id: psId, date_type: '2', date_id: new Date().toISOString().slice(0, 7).replace('-', '') } },
          ];

          let foundHistoricalData = false;

          for (const ep of endpoints) {
            const res = await sungrowPost(base_url, ep.path, conn.config, token, user_id, ep.body);
            const code = String(res?.result_code || '');
            console.log(`[backfillSungrow] ${ep.path} code=${code} keys=${JSON.stringify(Object.keys(res?.result_data || {})).slice(0, 200)}`);
            
            if (code === '1' && res?.result_data) {
              // Try to extract daily data
              const data = res.result_data;
              const lists = data?.dataList || data?.list || data?.pageList || [];
              if (Array.isArray(lists) && lists.length > 0) {
                console.log(`[backfillSungrow] Found ${lists.length} data points from ${ep.path}, sample: ${JSON.stringify(lists[0])}`);
                for (const item of lists) {
                  const dateStr = item.date_id || item.date || item.time || '';
                  const energy = parseFloat(item.energy || item.p_value || item.value || 0);
                  if (!dateStr || !energy) continue;
                  // Normalize date to YYYY-MM-DD
                  let dateKey = dateStr;
                  if (dateKey.length === 8) dateKey = `${dateKey.slice(0,4)}-${dateKey.slice(4,6)}-${dateKey.slice(6,8)}`;
                  
                  const key = `${snapStationId}__${dateKey}`;
                  if (existingKeys.has(key)) { totalSkipped++; continue; }

                  await db.entities.SiteGraphSnapshot.create({
                    station_id: snapStationId,
                    date_key: dateKey,
                    daily_yield_kwh: energy,
                    data: []
                  });
                  existingKeys.add(key);
                  totalCreated++;
                }
                foundHistoricalData = true;
                break;
              }
            }
          }

          if (!foundHistoricalData) {
            // Last resort: ensure today's snapshot exists from station list data
            const today = new Date().toISOString().slice(0, 10);
            const todayKey = `${snapStationId}__${today}`;
            const todayYield = parseField(station.today_energy);
            if (!existingKeys.has(todayKey) && todayYield > 0) {
              await db.entities.SiteGraphSnapshot.create({
                station_id: snapStationId,
                date_key: today,
                daily_yield_kwh: todayYield,
                data: []
              });
              existingKeys.add(todayKey);
              totalCreated++;
            }
          }

          console.log(`[backfillSungrow] Site ${site.name} (${psId}): created=${totalCreated}`);
          await new Promise(r => setTimeout(r, 300));
        }
      } catch(e) {
        errors.push({ connection: conn.id, error: e.message });
      }
    }

    return Response.json({ success: true, totalCreated, totalSkipped, errors });
  } catch(error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});