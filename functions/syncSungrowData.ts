import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

const GATEWAY = 'https://gateway.isolarcloud.eu';
const APPKEY  = 'BED64E9CFA1847D197F7AC924A19EEAC';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

// ── Authentication ───────────────────────────────────────────────────────────
async function sungrowLogin(config) {
  // Prefer OAuth2 token
  if (config.auth_method === 'oauth2' && config.oauth_access_token) {
    const baseUrl = (config.oauth_base_url || GATEWAY).replace(/\/$/, '');
    console.log(`[sungrowLogin] Using OAuth2 token, base_url=${baseUrl}`);
    return {
      token:       config.oauth_access_token,
      user_id:     config.oauth_user_id || '',
      base_url:    baseUrl,
      auth_method: 'oauth2'
    };
  }

  // Fallback: password login
  const candidates = [
    config.base_url?.trim().replace(/\/$/, ''),
    GATEWAY,
    'https://gateway.isolarcloud.com.hk'
  ].filter(Boolean);

  for (const baseUrl of candidates) {
    try {
      const res = await fetch(`${baseUrl}/openapi/login`, {
        method: 'POST',
        headers: buildHeaders(config.app_secret),
        body: JSON.stringify({
          appkey:        config.app_key || APPKEY,
          user_account:  config.user_account,
          user_password: md5(config.user_password),
          login_type:    '0'
        })
      });
      const data = await safeJson(res);
      if (data?.result_data?.token) {
        return {
          token:       data.result_data.token,
          user_id:     data.result_data.user_id,
          base_url:    baseUrl,
          auth_method: 'login'
        };
      }
    } catch (e) {
      console.log(`[sungrowLogin] Failed for ${baseUrl}: ${e.message}`);
    }
  }
  throw new Error('Sungrow login failed — check credentials or OAuth2 token');
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function buildHeaders(appSecret, accessToken) {
  const h = {
    'Content-Type': 'application/json;charset=UTF-8',
    'x-access-key':  appSecret,
    'sys_code':      '901',
    'lang':          '_en_US'
  };
  // Authorization header required for OAuth2 and device-level endpoints
  if (accessToken) {
    h['Authorization'] = `Bearer ${accessToken}`;
  }
  return h;
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

async function sungrowPost(base_url, path, config, token, user_id, body = {}, accessToken = null) {
  const fullBody = {
    appkey:         config.app_key || APPKEY,
    token,
    user_id,
    req_serial_num: Date.now().toString(36) + Math.random().toString(36).slice(2),
    ...body
  };
  const res = await fetch(`${base_url}${path}`, {
    method:  'POST',
    headers: buildHeaders(config.app_secret, accessToken || (config.auth_method === 'oauth2' ? config.oauth_access_token : null)),
    body:    JSON.stringify(fullBody)
  });
  return safeJson(res);
}

// ── Field parser ─────────────────────────────────────────────────────────────
function parseField(field) {
  if (!field && field !== 0) return 0;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    const num  = parseFloat(field.value) || 0;
    const unit = (field.unit || '').toLowerCase();
    if (unit === 'w')   return num / 1000;
    if (unit === 'mwh') return num * 1000;
    if (unit === 'gwh') return num * 1_000_000;
    return num;
  }
  return parseFloat(field) || 0;
}

// ── MPPT point IDs ───────────────────────────────────────────────────────────
const POINT_IDS = [
  13003, 13119, 13150,          // AC power, daily yield, temperature
  13009, 13010, 13011,          // Phase voltages L1/L2/L3
  13028, 13029, 13030, 13031,   // PV1–PV2 V/I
  13032, 13033, 13034, 13035,   // PV3–PV4 V/I
  13036, 13037, 13038, 13039,   // PV5–PV6 V/I
  13040, 13041, 13042, 13043,   // PV7–PV8 V/I
  13044, 13045, 13046, 13047,   // PV9–PV10 V/I
  13048, 13049, 13050, 13051,   // PV11–PV12 V/I
];
const PV_VOLT = [13028,13030,13032,13034,13036,13038,13040,13042,13044,13046,13048,13050];
const PV_CURR = [13029,13031,13033,13035,13037,13039,13041,13043,13045,13047,13049,13051];

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const connections = await db.entities.ApiConnection.filter({ provider: 'sungrow' });
    if (!connections.length) {
      return Response.json({ success: true, message: 'No Sungrow connections configured', synced: 0 });
    }

    let totalUpdated = 0;
    const errors = [];

    for (const conn of connections) {
      try {
        const { token, user_id, base_url, auth_method } = await sungrowLogin(conn.config);
        // For OAuth2, use the access token in Authorization header
        const oauthToken = auth_method === 'oauth2' ? conn.config.oauth_access_token : null;
        console.log(`[syncSungrow] Auth via ${auth_method} → ${base_url}`);

        // ── Get station list ───────────────────────────────────────────────
        const listRes = await sungrowPost(base_url, '/openapi/getPowerStationList', conn.config, token, user_id, {
          curPage: 1, size: 200
        }, oauthToken);

        const stations = listRes?.result_data?.pageList || listRes?.result_data?.list || [];
        console.log(`[syncSungrow] ${stations.length} stations found`);

        for (const station of stations) {
          const psId = String(station.ps_id || station.plant_id || station.id || '');
          if (!psId) continue;

          // ── Match site ─────────────────────────────────────────────────
          let site = null;
          const byId = await db.entities.Site.filter({ sungrow_station_id: psId });
          if (byId.length > 0) {
            site = byId[0];
          } else {
            const stationName = station.ps_name || station.name || '';
            const allSites = await db.entities.Site.list();
            site = allSites.find(s => s.name?.trim() === stationName.trim()) || null;
            if (site) {
              await db.entities.Site.update(site.id, {
                sungrow_station_id:    psId,
                sungrow_connection_id: conn.id
              });
              console.log(`[syncSungrow] Matched "${site.name}" by name → ps_id=${psId}`);
            }
          }
          if (!site) {
            console.log(`[syncSungrow] No site for ps_id=${psId} (${station.ps_name}), skipping`);
            continue;
          }

          // ── Parse station values ───────────────────────────────────────
          const currentPower  = parseField(station.curr_power);
          const dailyYield    = parseField(station.today_energy);
          const monthlyYield  = parseField(station.month_energy);
          const yearlyYield   = parseField(station.year_energy);
          const lifetimeYield = parseField(station.total_energy);

          const psStatus = station.ps_status;
          const status = (psStatus === 2 || psStatus === '2') ? 'offline'
                       : (psStatus === 3 || psStatus === '3') ? 'warning'
                       : 'online';

          const updateData = {
            current_power_kw:      currentPower,
            daily_yield_kwh:       dailyYield,
            monthly_yield_kwh:     monthlyYield,
            yearly_yield_kwh:      yearlyYield,
            lifetime_yield_kwh:    lifetimeYield,
            status,
            last_heartbeat:        new Date().toISOString(),
            sungrow_connection_id: conn.id
          };

          const capFromStation = parseField(station.total_capcity);
          if (capFromStation > 0) {
            updateData.dc_capacity_kwp = capFromStation;
          } else if (!site.dc_capacity_kwp || site.dc_capacity_kwp === 0) {
            const detailRes = await sungrowPost(base_url, '/openapi/getPowerStationDetail', conn.config, token, user_id, { ps_id: psId }, oauthToken);
            const capFromDetail = parseFloat(detailRes?.result_data?.design_capacity || 0);
            if (capFromDetail > 0) {
              updateData.dc_capacity_kwp = capFromDetail > 5000 ? capFromDetail / 1000 : capFromDetail;
            }
          }

          await db.entities.Site.update(site.id, updateData);
          totalUpdated++;
          console.log(`[syncSungrow] Site ${site.name}: power=${currentPower}kW daily=${dailyYield}kWh`);

          // ── Daily snapshot ─────────────────────────────────────────────
          try {
            const now        = new Date();
            const todayKey   = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
            const timeLabel  = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).slice(0, 5);
            const snapStationId = `sg_${psId}`;

            const existingSnaps = await db.entities.SiteGraphSnapshot.filter({ station_id: snapStationId, date_key: todayKey });
            if (existingSnaps.length > 0) {
              const snap = existingSnaps[0];
              if (currentPower > 0 || snap.data?.length > 0) {
                const filtered = (snap.data || []).filter(p => p.time !== timeLabel);
                filtered.push({ time: timeLabel, value: parseFloat(currentPower.toFixed(3)) });
                filtered.sort((a, b) => a.time.localeCompare(b.time));
                await db.entities.SiteGraphSnapshot.update(snap.id, { daily_yield_kwh: dailyYield, data: filtered });
              }
            } else {
              const dataPoints = currentPower > 0 ? [{ time: timeLabel, value: parseFloat(currentPower.toFixed(3)) }] : [];
              await db.entities.SiteGraphSnapshot.create({ station_id: snapStationId, date_key: todayKey, daily_yield_kwh: dailyYield, data: dataPoints });
            }
          } catch (e) {
            console.log(`[syncSungrow] Snapshot error for ${psId}: ${e.message}`);
          }

          // ── Sync inverters ─────────────────────────────────────────────
          try {
            // Get device list — try both endpoints
            let devListRes = await sungrowPost(base_url, '/openapi/getPsDeviceList', conn.config, token, user_id, { ps_id: psId }, oauthToken);
            console.log(`[syncSungrow] getPsDeviceList code=${devListRes?.result_code}`);

            if (!devListRes?.result_data || devListRes?.result_code === 'E900') {
              devListRes = await sungrowPost(base_url, '/openapi/getDeviceList', conn.config, token, user_id, { ps_id: psId }, oauthToken);
              console.log(`[syncSungrow] getDeviceList code=${devListRes?.result_code}`);
            }

            // Extract devices from any array field in result_data
            let devices = [];
            for (const val of Object.values(devListRes?.result_data || {})) {
              if (Array.isArray(val) && val.length > 0) { devices = val; break; }
            }

            const inverterDevices = devices.filter(d => {
              const dtype     = d.dev_type || d.device_type || d.type_id || d.devType || 0;
              const dtypeName = (d.dev_type_name || d.device_type_name || d.typeName || '').toLowerCase();
              return dtype === 1 || dtype === '1' || dtypeName.includes('inverter') || dtypeName.includes('逆变器');
            });
            console.log(`[syncSungrow] ps_id=${psId}: ${devices.length} devices, ${inverterDevices.length} inverters`);

            for (const dev of inverterDevices) {
              const devSn = String(dev.dev_sn || dev.sn || dev.device_sn || '');
              const devId = String(dev.dev_id || dev.device_id || dev.id || '');
              if (!devSn && !devId) continue;

              // ── Real-time data with Authorization header ───────────────
              let pointMap = {};
              const reqBodies = [
                { ps_id: psId, device_sn: devSn, point_id_list: POINT_IDS },
                { ps_id: psId, dev_sn:    devSn, point_id_list: POINT_IDS },
                { ps_id: psId, device_id: devId, point_id_list: POINT_IDS },
                { ps_id: psId, dev_id:    devId, point_id_list: POINT_IDS },
              ];

              for (const reqBody of reqBodies) {
                if (Object.keys(pointMap).length > 0) break;
                const rtRes = await sungrowPost(base_url, '/openapi/queryDeviceRealTimeData', conn.config, token, user_id, reqBody, oauthToken);
                const code  = String(rtRes?.result_code || '');
                console.log(`[syncSungrow] queryDeviceRealTimeData sn=${devSn} code=${code}`);

                if (code === '1') {
                  const rd = rtRes.result_data;
                  if (Array.isArray(rd)) {
                    rd.forEach(p => { if (p.point_id !== undefined) pointMap[String(p.point_id)] = p.value; });
                  } else if (rd && typeof rd === 'object') {
                    const inner = rd[devSn] || rd[devId] || rd;
                    if (typeof inner === 'object') {
                      Object.entries(inner).forEach(([k, v]) => { pointMap[String(k)] = v; });
                    }
                  }
                  if (Object.keys(pointMap).length > 0) {
                    console.log(`[syncSungrow] Got ${Object.keys(pointMap).length} points for sn=${devSn}`);
                  }
                }
              }

              function getPoint(id) {
                const v = pointMap[String(id)];
                return v !== undefined && v !== null ? (parseFloat(v) || 0) : 0;
              }

              // ── Build MPPT strings ─────────────────────────────────────
              const mpptStrings = [];
              for (let i = 0; i < PV_VOLT.length; i++) {
                const v = getPoint(PV_VOLT[i]);
                const a = getPoint(PV_CURR[i]);
                if (v === 0 && a === 0) continue;
                mpptStrings.push({
                  string_id: `PV${i + 1}`,
                  voltage_v: v,
                  current_a: a,
                  power_kw:  parseFloat(((v * a) / 1000).toFixed(3))
                });
              }

              const acPower      = getPoint(13003);
              const dailyYieldInv = getPoint(13119);
              const temp         = pointMap['13150'] !== undefined ? (parseFloat(pointMap['13150']) || null) : null;
              const totalDcPower = mpptStrings.reduce((s, p) => s + p.power_kw, 0);
              const efficiency   = totalDcPower > 0 ? parseFloat(((acPower / totalDcPower) * 100).toFixed(1)) : 0;
              const devStatus    = (dev.dev_status || dev.status) === 1 ? 'online'
                                 : (dev.dev_status || dev.status) === 2 ? 'warning'
                                 : 'offline';

              const invData = {
                site_id:              site.id,
                name:                 devSn || devId,
                model:                dev.dev_model || dev.model || '',
                rated_power_kw:       parseFloat(dev.dev_capacity || dev.rated_power || 0) || 0,
                current_ac_power_kw:  acPower,
                current_dc_power_kw:  totalDcPower,
                efficiency_percent:   efficiency,
                temperature_c:        temp,
                status:               devStatus,
                daily_yield_kwh:      dailyYieldInv,
                mppt_strings:         mpptStrings,
                phase_voltages: {
                  l1: getPoint(13009),
                  l2: getPoint(13010),
                  l3: getPoint(13011)
                },
                sungrow_device_sn: devSn,
                sungrow_device_id: devId
              };

              const existingInvs = await db.entities.Inverter.filter({ sungrow_device_sn: devSn });
              if (existingInvs.length > 0) {
                await db.entities.Inverter.update(existingInvs[0].id, invData);
              } else {
                await db.entities.Inverter.create(invData);
              }
              console.log(`[syncSungrow] Inverter ${devSn}: AC=${acPower}kW DC=${totalDcPower}kW strings=${mpptStrings.length}`);
            }
          } catch (e) {
            console.log(`[syncSungrow] Inverter sync error for ps_id=${psId}: ${e.message}`);
          }
        }

        await db.entities.ApiConnection.update(conn.id, {
          status:        'connected',
          last_sync:     new Date().toISOString(),
          error_message: null
        });

      } catch (e) {
        console.error(`[syncSungrow] Connection ${conn.id} error: ${e.message}`);
        errors.push({ connection_id: conn.id, error: e.message });
        await db.entities.ApiConnection.update(conn.id, {
          status:        'error',
          error_message: e.message
        }).catch(() => {});
      }
    }

    return Response.json({
      success:            true,
      connections_synced: connections.length,
      sites_updated:      totalUpdated,
      errors,
      synced_at:          new Date().toISOString()
    });

  } catch (error) {
    console.error('[syncSungrow] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
