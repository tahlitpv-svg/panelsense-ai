import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

// Login to Sungrow and return { token, user_id, base_url }
async function sungrowLogin(config) {
  const candidates = [];
  if (config.base_url && config.base_url.trim()) {
    candidates.push(config.base_url.trim().replace(/\/$/, ''));
  }
  candidates.push('https://gateway.isolarcloud.eu', 'https://gateway.isolarcloud.com.hk');

  for (const baseUrl of candidates) {
    try {
      const res = await fetch(`${baseUrl}/openapi/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-key': config.app_secret,
          'sys_code': '901',
          'lang': '_en_US'
        },
        body: JSON.stringify({
          appkey: config.app_key,
          user_account: config.user_account,
          user_password: md5(config.user_password),
          login_type: '0'
        })
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { continue; }
      if (data?.result_data?.token) {
        return {
          token: data.result_data.token,
          user_id: data.result_data.user_id,
          base_url: baseUrl
        };
      }
    } catch (e) {
      console.log(`[sungrowLogin] failed for ${baseUrl}: ${e.message}`);
    }
  }
  throw new Error('Sungrow login failed - check credentials');
}

// Generic Sungrow API call
async function sungrowPost(base_url, path, config, token, user_id, body = {}) {
  const serialNum = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const fullBody = {
    appkey: config.app_key,
    token,
    user_id,
    req_serial_num: serialNum,
    ...body
  };
  const res = await fetch(`${base_url}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-key': config.app_secret,
      'sys_code': '901',
      'lang': '_en_US'
    },
    body: JSON.stringify(fullBody)
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return null; }
}

function detectRegion(lat) {
  if (!lat) return 'center';
  if (lat > 32.5) return 'north';
  if (lat > 31.5) return 'center';
  if (lat > 30.0) return 'south';
  return 'arava';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Find all Sungrow ApiConnection records
    const connections = await db.entities.ApiConnection.filter({ provider: 'sungrow' });
    if (!connections.length) {
      return Response.json({ success: true, message: 'No Sungrow connections configured', synced: 0 });
    }

    let totalUpdated = 0;
    const errors = [];

    for (const conn of connections) {
      try {
        const { token, user_id, base_url } = await sungrowLogin(conn.config);
        console.log(`[syncSungrow] Logged in to ${base_url} for connection ${conn.id}`);

        // Fetch station list
        const listRes = await sungrowPost(base_url, '/openapi/getPowerStationList', conn.config, token, user_id, {
          curPage: 1,
          size: 200
        });

        const stations = listRes?.result_data?.pageList || listRes?.result_data?.list || [];
        console.log(`[syncSungrow] Got ${stations.length} stations for connection ${conn.id}`);

        for (const station of stations) {
          const psId = String(station.ps_id || station.plant_id || station.id);
          if (!psId) continue;

          // Find matching Site by sungrow_station_id first, then fallback to name match
          let site = null;
          const byId = await db.entities.Site.filter({ sungrow_station_id: psId });
          if (byId.length > 0) {
            site = byId[0];
          } else {
            // Fallback: match by name
            const stationName = station.ps_name || station.name || '';
            const allSites = await db.entities.Site.list();
            site = allSites.find(s => s.name && s.name.trim() === stationName.trim()) || null;
            if (site) {
              // Save the sungrow_station_id for future syncs
              await db.entities.Site.update(site.id, { sungrow_station_id: psId, sungrow_connection_id: conn.id });
              console.log(`[syncSungrow] Matched site "${site.name}" by name → saved ps_id=${psId}`);
            }
          }
          if (!site) {
            console.log(`[syncSungrow] No site found for ps_id=${psId} (${station.ps_name}), skipping`);
            continue;
          }

          // Get detailed station data
          const detailRes = await sungrowPost(base_url, '/openapi/getPowerStationDetail', conn.config, token, user_id, {
            ps_id: psId
          });

          const detail = detailRes?.result_data || {};

          // Also try getPsKpi for live energy metrics
          const kpiRes = await sungrowPost(base_url, '/openapi/getPsKpi', conn.config, token, user_id, { ps_id: psId });
          const kpi = kpiRes?.result_data || {};
          console.log(`[syncSungrow] ps_id=${psId} station_keys=${JSON.stringify(Object.keys(station))} kpi_keys=${JSON.stringify(Object.keys(kpi))}`);
          console.log(`[syncSungrow] ps_id=${psId} station_sample=${JSON.stringify(station)} kpi_sample=${JSON.stringify(kpi)}`);

          // Map Sungrow fields - check station list data, detail, and kpi
          const currentPower = parseFloat(kpi.curr_power ?? detail.curr_power ?? station.curr_power ?? station.real_health_state_power ?? 0) || 0;
          const dailyYield = parseFloat(kpi.today_energy ?? detail.today_energy ?? station.today_energy ?? 0) || 0;
          const monthlyYield = parseFloat(kpi.month_energy ?? detail.month_energy ?? station.month_energy ?? 0) || 0;
          const yearlyYield = parseFloat(kpi.year_energy ?? detail.year_energy ?? station.year_energy ?? 0) || 0;
          const lifetimeYield = parseFloat(kpi.total_energy ?? detail.total_energy ?? station.total_energy ?? 0) || 0;

          const healthState = detail.ps_health_state ?? station.ps_health_state;
          let status = 'online';
          if (healthState === '1') status = 'warning';
          else if (healthState === '2') status = 'offline';

          const updateData = {
            current_power_kw: currentPower,
            daily_yield_kwh: dailyYield,
            monthly_yield_kwh: monthlyYield,
            yearly_yield_kwh: yearlyYield,
            lifetime_yield_kwh: lifetimeYield,
            status,
            last_heartbeat: new Date().toISOString(),
            sungrow_connection_id: conn.id
          };

          // Only set capacity if not already set
          if (!site.dc_capacity_kwp || site.dc_capacity_kwp === 0) {
            const cap = parseFloat(detail.design_capacity ?? station.design_capacity ?? 0);
            if (cap > 0) updateData.dc_capacity_kwp = cap;
          }

          await db.entities.Site.update(site.id, updateData);
          totalUpdated++;
          console.log(`[syncSungrow] Updated site ${site.name}: power=${currentPower}kW daily=${dailyYield}kWh`);
        }

        // Update connection status
        await db.entities.ApiConnection.update(conn.id, {
          status: 'connected',
          last_sync: new Date().toISOString(),
          error_message: null
        });

      } catch (e) {
        console.error(`[syncSungrow] Error for connection ${conn.id}: ${e.message}`);
        errors.push({ connection_id: conn.id, error: e.message });
        await db.entities.ApiConnection.update(conn.id, {
          status: 'error',
          error_message: e.message
        }).catch(() => {});
      }
    }

    return Response.json({
      success: true,
      connections_synced: connections.length,
      sites_updated: totalUpdated,
      errors,
      synced_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[syncSungrow] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});