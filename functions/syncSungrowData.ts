import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

// Login to Sungrow and return { token, user_id, base_url, auth_method }
// Prefers OAuth2 token if available, falls back to password login
async function sungrowLogin(config) {
  // Try OAuth2 first if available
  if (config.auth_method === 'oauth2' && config.oauth_access_token) {
    const baseUrl = config.oauth_base_url || config.base_url || 'https://gateway.isolarcloud.eu';
    console.log(`[sungrowLogin] Using OAuth2 token, base_url=${baseUrl}`);
    return {
      token: config.oauth_access_token,
      user_id: config.oauth_user_id || '',
      base_url: baseUrl.replace(/\/$/, ''),
      auth_method: 'oauth2'
    };
  }

  // Fallback to standard login
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
          base_url: baseUrl,
          auth_method: 'login'
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
        let loginResult = await sungrowLogin(conn.config);
        let { token, user_id, base_url, auth_method } = loginResult;
        console.log(`[syncSungrow] Authenticated to ${base_url} via ${auth_method} for connection ${conn.id}`);

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

          // Sungrow returns values as objects: {"unit": "kWh", "value": "537.6"} or plain numbers
          function parseField(field) {
            if (!field && field !== 0) return 0;
            if (typeof field === 'object' && field !== null && 'value' in field) {
              const num = parseFloat(field.value) || 0;
              const unit = (field.unit || '').toLowerCase();
              if (unit === 'w') return num / 1000;
              if (unit === 'mwh') return num * 1000;
              if (unit === 'gwh') return num * 1000000;
              return num;
            }
            return parseFloat(field) || 0;
          }

          const currentPower = parseField(station.curr_power);
          const dailyYield = parseField(station.today_energy);
          const monthlyYield = parseField(station.month_energy);
          const yearlyYield = parseField(station.year_energy);
          const lifetimeYield = parseField(station.total_energy);

          // ps_status: 1=online, 2=offline, 3=fault/warning
          const psStatus = station.ps_status;
          let status = 'online';
          if (psStatus === 2 || psStatus === '2') status = 'offline';
          else if (psStatus === 3 || psStatus === '3') status = 'warning';

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

          // Capacity: prefer total_capcity from station list (already in kWp), fallback to design_capacity
          // design_capacity comes in Watts from API, total_capcity comes in kWp
          const capFromStation = parseField(station.total_capcity); // kWp
          if (capFromStation > 0) {
            updateData.dc_capacity_kwp = capFromStation;
          } else if (!site.dc_capacity_kwp || site.dc_capacity_kwp === 0) {
            const capFromDetail = parseFloat(detail.design_capacity || 0);
            if (capFromDetail > 0) {
              // design_capacity is in Watts if > 5000, convert to kWp
              updateData.dc_capacity_kwp = capFromDetail > 5000 ? capFromDetail / 1000 : capFromDetail;
            }
          }

          await db.entities.Site.update(site.id, updateData);
          totalUpdated++;
          console.log(`[syncSungrow] Updated site ${site.name}: power=${currentPower}kW daily=${dailyYield}kWh cap=${updateData.dc_capacity_kwp || site.dc_capacity_kwp}kWp`);

          // Save daily snapshot for historical chart + power curve accumulation
          {
            const now = new Date();
            // Use Israel local time (Asia/Jerusalem) for both date and time labels
            const jeruFmt = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', ...opts }).format(now);
            const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now); // YYYY-MM-DD in Israel time
            const snapStationId = `sg_${psId}`;
            const rawTime = jeruFmt({ hour: '2-digit', minute: '2-digit', hour12: false }); // "HH:MM" in Israel time
            const timeLabel = rawTime.replace(',', '').trim().slice(0, 5);
            try {
              const existingSnaps = await db.entities.SiteGraphSnapshot.filter({ station_id: snapStationId, date_key: todayKey });
              if (existingSnaps.length > 0) {
                const snap = existingSnaps[0];
                const existingData = snap.data || [];
                // Append current power reading (only if power > 0 or we have existing data points)
                if (currentPower > 0 || existingData.length > 0) {
                  // Avoid duplicate time entries - remove same-minute entry if exists
                  const filtered = existingData.filter(p => p.time !== timeLabel);
                  filtered.push({ time: timeLabel, value: parseFloat(currentPower.toFixed(3)) });
                  filtered.sort((a, b) => a.time.localeCompare(b.time));
                  await db.entities.SiteGraphSnapshot.update(snap.id, {
                    daily_yield_kwh: dailyYield,
                    data: filtered
                  });
                }
              } else {
                const dataPoints = currentPower > 0 ? [{ time: timeLabel, value: parseFloat(currentPower.toFixed(3)) }] : [];
                await db.entities.SiteGraphSnapshot.create({
                  station_id: snapStationId,
                  date_key: todayKey,
                  daily_yield_kwh: dailyYield,
                  data: dataPoints
                });
              }
              console.log(`[syncSungrow] Snapshot saved for ${psId}: daily=${dailyYield}kWh power=${currentPower}kW at ${timeLabel}`);
            } catch(e) {
              console.log(`[syncSungrow] Snapshot save error for ${psId}: ${e.message}`);
            }
          }

          // --- Sync inverters for this station ---
          try {
            // Try multiple device list endpoints
            let devListRes = await sungrowPost(base_url, '/openapi/getPsDeviceList', conn.config, token, user_id, { ps_id: psId });
            console.log(`[syncSungrow] getPsDeviceList code=${devListRes?.result_code} keys=${JSON.stringify(Object.keys(devListRes?.result_data || {}))}`);
            
            // Try alternate endpoint if first fails
            if (!devListRes?.result_data || devListRes?.result_code === 'E900') {
              devListRes = await sungrowPost(base_url, '/openapi/getDeviceList', conn.config, token, user_id, { ps_id: psId });
              console.log(`[syncSungrow] getDeviceList code=${devListRes?.result_code} keys=${JSON.stringify(Object.keys(devListRes?.result_data || {}))}`);
            }
            
            // Extract devices from various response structures
            const rdKeys = Object.keys(devListRes?.result_data || {});
            let devices = [];
            for (const key of rdKeys) {
              const val = devListRes.result_data[key];
              if (Array.isArray(val) && val.length > 0) {
                devices = val;
                console.log(`[syncSungrow] Found devices under key="${key}" count=${devices.length}`);
                break;
              }
            }
            
            const inverterDevices = devices.filter(d => {
              const dtype = d.dev_type || d.device_type || d.type_id || d.devType || 0;
              const dtypeName = (d.dev_type_name || d.device_type_name || d.typeName || '').toLowerCase();
              return dtype === 1 || dtype === '1' || dtypeName.includes('inverter') || dtypeName.includes('逆变器');
            });
            console.log(`[syncSungrow] ps_id=${psId} devices=${devices.length} inverters=${inverterDevices.length} sample=${JSON.stringify(devices[0] || {})}`);

            for (const dev of inverterDevices) {
              const devSn = String(dev.dev_sn || dev.sn || dev.device_sn || '');
              const devId = String(dev.dev_id || dev.device_id || dev.id || '');
              if (!devSn && !devId) continue;

              // Fetch device real-time data via queryDeviceRealTimeData with point_id_list
              // Point IDs: 13003=AC Power, 13119=Daily Yield, 13150=Temperature
              // 13009=U_AB(L1), 13010=U_BC(L2), 13011=U_CA(L3)
              // PV1-PV12 Voltage: 13028,13030,13032,13034,13036,13038,13040,13042,13044,13046,13048,13050
              // PV1-PV12 Current: 13029,13031,13033,13035,13037,13039,13041,13043,13045,13047,13049,13051
              const POINT_IDS = [
                13003, 13119, 13150,        // AC power, daily yield, temperature
                13009, 13010, 13011,        // Phase voltages L1/L2/L3
                13028, 13029,               // PV1 V/I
                13030, 13031,               // PV2 V/I
                13032, 13033,               // PV3 V/I
                13034, 13035,               // PV4 V/I
                13036, 13037,               // PV5 V/I
                13038, 13039,               // PV6 V/I
                13040, 13041,               // PV7 V/I
                13042, 13043,               // PV8 V/I
                13044, 13045,               // PV9 V/I
                13046, 13047,               // PV10 V/I
                13048, 13049,               // PV11 V/I
                13050, 13051,               // PV12 V/I
              ];

              let pointMap = {}; // point_id -> value
              try {
                // Try by device_sn first, then by device_id
                const bodies = [
                  { ps_id: psId, device_sn: devSn, point_id_list: POINT_IDS },
                  { ps_id: psId, dev_sn: devSn, point_id_list: POINT_IDS },
                  { ps_id: psId, device_id: devId, point_id_list: POINT_IDS },
                  { ps_id: psId, dev_id: devId, point_id_list: POINT_IDS },
                ];
                for (const reqBody of bodies) {
                  if (Object.keys(pointMap).length > 0) break;
                  const rtRes = await sungrowPost(base_url, '/openapi/queryDeviceRealTimeData', conn.config, token, user_id, reqBody);
                  const code = String(rtRes?.result_code || '');
                  console.log(`[syncSungrow] queryDeviceRealTimeData sn=${devSn} code=${code}`);
                  if (code === '1') {
                    // Response can be array of {point_id, value} or object keyed by point_id
                    const rd = rtRes.result_data;
                    if (Array.isArray(rd)) {
                      rd.forEach(p => { if (p.point_id !== undefined) pointMap[String(p.point_id)] = p.value; });
                    } else if (rd && typeof rd === 'object') {
                      // Could be { device_sn: { point_id: value } } or flat { point_id: value }
                      const inner = rd[devSn] || rd[devId] || rd;
                      if (typeof inner === 'object') {
                        Object.entries(inner).forEach(([k, v]) => { pointMap[String(k)] = v; });
                      }
                    }
                    if (Object.keys(pointMap).length > 0) {
                      console.log(`[syncSungrow] Got ${Object.keys(pointMap).length} point values for sn=${devSn}`);
                    }
                  }
                }
              } catch(e) { console.log(`[syncSungrow] rtData error: ${e.message}`); }

              function getPoint(id) {
                const v = pointMap[String(id)];
                return v !== undefined && v !== null ? (parseFloat(v) || 0) : 0;
              }

              const acPower = getPoint(13003);
              const dcPower = 0; // calculated below from PV strings
              const temp = pointMap['13150'] !== undefined ? parseFloat(pointMap['13150']) || null : null;
              const dailyYieldInv = getPoint(13119);

              // MPPT strings from PV1-PV12 point IDs
              const pvVoltPoints = [13028,13030,13032,13034,13036,13038,13040,13042,13044,13046,13048,13050];
              const pvCurrPoints = [13029,13031,13033,13035,13037,13039,13041,13043,13045,13047,13049,13051];
              const mpptStrings = [];
              for (let i = 0; i < pvVoltPoints.length; i++) {
                const vNum = getPoint(pvVoltPoints[i]);
                const aNum = getPoint(pvCurrPoints[i]);
                if (vNum === 0 && aNum === 0) continue;
                mpptStrings.push({ string_id: `PV${i + 1}`, voltage_v: vNum, current_a: aNum, power_kw: parseFloat(((vNum * aNum) / 1000).toFixed(3)) });
              }

              // Phase voltages (L1=U_AB, L2=U_BC, L3=U_CA)
              const phase_voltages = {
                l1: getPoint(13009),
                l2: getPoint(13010),
                l3: getPoint(13011),
              };

              const totalDcPower = mpptStrings.reduce((sum, s) => sum + s.power_kw, 0);
              const efficiency = totalDcPower > 0 ? parseFloat(((acPower / totalDcPower) * 100).toFixed(1)) : 0;
              const devStatus = (dev.dev_status || dev.status) === 1 ? 'online' : (dev.dev_status || dev.status) === 2 ? 'warning' : 'offline';

              const invData = {
                site_id: site.id,
                name: devSn || devId,
                model: dev.dev_model || dev.model || '',
                rated_power_kw: parseFloat(dev.dev_capacity || dev.rated_power || 0) || 0,
                current_ac_power_kw: acPower,
                current_dc_power_kw: dcPower,
                efficiency_percent: efficiency,
                temperature_c: temp,
                status: devStatus,
                daily_yield_kwh: dailyYieldInv,
                mppt_strings: mpptStrings,
                phase_voltages,
                sungrow_device_sn: devSn,
                sungrow_device_id: devId
              };

              const existingInvs = await db.entities.Inverter.filter({ sungrow_device_sn: devSn });
              if (existingInvs.length > 0) {
                await db.entities.Inverter.update(existingInvs[0].id, invData);
              } else {
                await db.entities.Inverter.create(invData);
              }
            }
          } catch(e) {
            console.log(`[syncSungrow] Inverter sync error for ps_id=${psId}: ${e.message}`);
          }
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