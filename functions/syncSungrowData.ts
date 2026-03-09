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
            const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
            const snapStationId = `sg_${psId}`;
            const timeLabel = now.toISOString().slice(11, 16); // HH:MM UTC
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
            const devListRes = await sungrowPost(base_url, '/openapi/getPsDeviceList', conn.config, token, user_id, { ps_id: psId });
            const devices = devListRes?.result_data?.deviceListItems || devListRes?.result_data?.list || [];
            const inverterDevices = devices.filter(d => d.dev_type === 1 || d.device_type === 1 || (d.dev_type_name || '').toLowerCase().includes('inverter'));
            console.log(`[syncSungrow] ps_id=${psId} devices=${devices.length} inverters=${inverterDevices.length}`);

            for (const dev of inverterDevices) {
              const devSn = String(dev.dev_sn || dev.sn || dev.device_sn || '');
              const devId = String(dev.dev_id || dev.device_id || dev.id || '');
              if (!devSn && !devId) continue;

              // Fetch device real-time data
              let devData = {};
              try {
                const rtRes = await sungrowPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, { dev_sn: devSn, ps_id: psId });
                if (rtRes?.result_code === '1' || rtRes?.result_code === 1) {
                  devData = rtRes?.result_data || {};
                }
              } catch(e) {}

              // Parse inverter real-time values
              function parseDevField(key) {
                const v = devData[key];
                return v !== undefined ? (parseFloat(v) || 0) : 0;
              }

              const acPower = parseDevField('p_ac') || parseDevField('total_active_power') || parseDevField('pac');
              const dcPower = parseDevField('total_dc_power') || parseDevField('p_dc');
              const temp = devData['temperature'] !== undefined ? parseFloat(devData['temperature']) : null;
              const dailyYieldInv = parseDevField('daily_yield_energy') || parseDevField('today_yield');

              // MPPT strings
              const mpptStrings = [];
              for (let i = 1; i <= 32; i++) {
                const v = devData[`mppt_${i}_volt`] || devData[`pv${i}_volt`] || devData[`u_pv${i}`];
                const a = devData[`mppt_${i}_curr`] || devData[`pv${i}_curr`] || devData[`i_pv${i}`];
                if (v === undefined) break;
                const vNum = parseFloat(v) || 0;
                const aNum = parseFloat(a) || 0;
                if (vNum === 0 && aNum === 0) continue;
                mpptStrings.push({ string_id: `PV${i}`, voltage_v: vNum, current_a: aNum, power_kw: parseFloat(((vNum * aNum) / 1000).toFixed(3)) });
              }

              // Phase voltages
              const phase_voltages = {
                l1: parseDevField('ab_volt') || parseDevField('phase_a_volt') || parseDevField('u_ac1'),
                l2: parseDevField('bc_volt') || parseDevField('phase_b_volt') || parseDevField('u_ac2'),
                l3: parseDevField('ca_volt') || parseDevField('phase_c_volt') || parseDevField('u_ac3'),
              };

              const efficiency = dcPower > 0 ? parseFloat(((acPower / dcPower) * 100).toFixed(1)) : 0;
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