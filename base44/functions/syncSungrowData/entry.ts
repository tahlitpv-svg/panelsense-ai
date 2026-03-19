import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

const GATEWAY = 'https://gateway.isolarcloud.eu';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

async function sungrowLogin(config) {
  const baseUrl = (config.base_url || GATEWAY).replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/openapi/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
  });
  const data = await res.json();
  if (!data?.result_data?.token) throw new Error(`Login failed: ${data?.result_msg || JSON.stringify(data)}`);
  console.log(`[sungrowLogin] OK as ${config.user_account} → ${baseUrl}`);
  return { token: data.result_data.token, user_id: data.result_data.user_id, base_url: baseUrl };
}

async function sgPost(base_url, path, config, token, user_id, body = {}) {
  const res = await fetch(`${base_url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, token, user_id, req_serial_num: Date.now().toString(36) + Math.random().toString(36).slice(2), ...body })
  });
  try { return await res.json(); } catch { return null; }
}

function parseField(field) {
  if (!field && field !== 0) return 0;
  if (typeof field === 'object' && 'value' in field) {
    const num = parseFloat(field.value) || 0;
    const unit = (field.unit || '').toLowerCase();
    if (unit === 'w') return num / 1000;
    if (unit === 'mwh') return num * 1000;
    if (unit === 'gwh') return num * 1_000_000;
    return num;
  }
  return parseFloat(field) || 0;
}

// Sungrow realtime APIs may return point values as either primitives or objects.
// Normalize everything into a number so downstream MPPT graph logic works.
function parsePointValue(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object') {
    if ('value' in v) return parseFloat(String((v as any).value)) || 0;
    if ('point_value' in v) return parseFloat(String((v as any).point_value)) || 0;
  }
  return parseFloat(String(v)) || 0;
}

const POINT_IDS = [
  13003, 13119, 13150,
  13009, 13010, 13011,
  13028, 13029, 13030, 13031, 13032, 13033, 13034, 13035,
  13036, 13037, 13038, 13039, 13040, 13041, 13042, 13043,
  13044, 13045, 13046, 13047, 13048, 13049, 13050, 13051,
];
const PV_VOLT = [13028,13030,13032,13034,13036,13038,13040,13042,13044,13046,13048,13050];
const PV_CURR = [13029,13031,13033,13035,13037,13039,13041,13043,13045,13047,13049,13051];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const connections = await db.entities.ApiConnection.filter({ provider: 'sungrow' });
    if (!connections.length) return Response.json({ success: true, message: 'No Sungrow connections', synced: 0 });

    let totalUpdated = 0;
    const errors = [];

    for (const conn of connections) {
      try {
        const { token, user_id, base_url } = await sungrowLogin(conn.config);

        // Station list
        const listRes = await sgPost(base_url, '/openapi/getPowerStationList', conn.config, token, user_id, { curPage: 1, size: 200 });
        const stations = listRes?.result_data?.pageList || listRes?.result_data?.list || [];
        console.log(`[syncSungrow] ${stations.length} stations`);

        for (const station of stations) {
          const psId = String(station.ps_id || station.plant_id || station.id || '');
          if (!psId) continue;

          // Match site
          let site = null;
          const byId = await db.entities.Site.filter({ sungrow_station_id: psId });
          if (byId.length > 0) {
            site = byId[0];
          } else {
            const name = station.ps_name || station.name || '';
            const all = await db.entities.Site.list();
            site = all.find(s => s.name?.trim() === name.trim()) || null;
            if (site) await db.entities.Site.update(site.id, { sungrow_station_id: psId, sungrow_connection_id: conn.id });
          }
          if (!site) { console.log(`[syncSungrow] No site for ps_id=${psId}`); continue; }

          // Update site
          const currentPower  = parseField(station.curr_power);
          const dailyYield    = parseField(station.today_energy);
          const status = station.ps_status === 2 || station.ps_status === '2' ? 'offline'
                       : station.ps_status === 3 || station.ps_status === '3' ? 'warning' : 'online';

          const updateData: any = {
            current_power_kw:   currentPower,
            daily_yield_kwh:    dailyYield,
            monthly_yield_kwh:  parseField(station.month_energy),
            yearly_yield_kwh:   parseField(station.year_energy),
            lifetime_yield_kwh: parseField(station.total_energy),
            status,
            last_heartbeat:     new Date().toISOString(),
            sungrow_connection_id: conn.id
          };
          const cap = parseField(station.total_capcity);
          if (cap > 0) updateData.dc_capacity_kwp = cap;

          await db.entities.Site.update(site.id, updateData);
          totalUpdated++;
          console.log(`[syncSungrow] Site "${site.name}": ${currentPower}kW / ${dailyYield}kWh`);

          // Snapshot
          try {
            const now      = new Date();
            const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
            const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).slice(0, 5);
            const snapId   = `sg_${psId}`;
            const snaps    = await db.entities.SiteGraphSnapshot.filter({ station_id: snapId, date_key: todayKey });
            if (snaps.length > 0) {
              if (currentPower > 0 || snaps[0].data?.length > 0) {
                const pts = (snaps[0].data || []).filter(p => p.time !== timeLabel);
                pts.push({ time: timeLabel, value: parseFloat(currentPower.toFixed(3)) });
                pts.sort((a, b) => a.time.localeCompare(b.time));
                await db.entities.SiteGraphSnapshot.update(snaps[0].id, { daily_yield_kwh: dailyYield, data: pts });
              }
            } else {
              await db.entities.SiteGraphSnapshot.create({ station_id: snapId, date_key: todayKey, daily_yield_kwh: dailyYield, data: currentPower > 0 ? [{ time: timeLabel, value: parseFloat(currentPower.toFixed(3)) }] : [] });
            }
          } catch (e) { console.log(`[syncSungrow] Snapshot error: ${e.message}`); }

          // Inverters
          try {
            // Get device list with login token (should work now!)
            let devListRes = await sgPost(base_url, '/openapi/getDeviceList', conn.config, token, user_id, { ps_id: psId, curPage: 1, size: 100 });
            console.log(`[syncSungrow] getDeviceList code=${devListRes?.result_code}`);

            if (devListRes?.result_code !== '1') {
              devListRes = await sgPost(base_url, '/openapi/getPsDeviceList', conn.config, token, user_id, { ps_id: psId });
              console.log(`[syncSungrow] getPsDeviceList code=${devListRes?.result_code}`);
            }

            let devices = [];
            for (const val of Object.values(devListRes?.result_data || {})) {
              if (Array.isArray(val) && val.length > 0) { devices = val; break; }
            }

            const inverters = devices.filter(d => {
              const dtype = d.dev_type || d.device_type || d.type_id || 0;
              const dname = (d.dev_type_name || d.device_type_name || '').toLowerCase();
              return dtype === 1 || dtype === '1' || dname.includes('inverter');
            });
            console.log(`[syncSungrow] ps_id=${psId}: ${inverters.length} inverters`);

            for (const dev of inverters) {
              const devSn = String(dev.dev_sn || dev.sn || dev.device_sn || '');
              const devId = String(dev.dev_id || dev.device_id || dev.id || '');
              const psKey = String(dev.ps_key || '');
              if (!devSn && !devId) continue;

              // Real-time data
              let pointMap = {};

              // Try getDeviceRealTimeData with ps_key first
              if (psKey) {
                const r = await sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, {
                  ps_key_list: [psKey], device_type: "1", point_id_list: POINT_IDS.map(String)
                });
                console.log(`[syncSungrow] getDeviceRealTimeData ps_key=${psKey} code=${r?.result_code}`);
                if (r?.result_code === '1') {
                  const rd = r.result_data?.device_point_list;
                  if (Array.isArray(rd)) {
                    rd.forEach(deviceInfo => {
                      const points = deviceInfo.point_list || [];
                      points.forEach(p => {
                        if (p.point_id !== undefined) pointMap[String(p.point_id)] = parsePointValue(p.point_value);
                      });
                    });
                  }
                }
              }

              // Fallback: getDeviceRealTimeData with sn_list
              if (Object.keys(pointMap).length === 0 && devSn) {
                const r = await sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, {
                  sn_list: [devSn], device_type: "1", point_id_list: POINT_IDS.map(String)
                });
                console.log(`[syncSungrow] fallback getDeviceRealTimeData sn=${devSn} code=${r?.result_code}`);
                if (r?.result_code === '1') {
                  const rd = r.result_data?.device_point_list;
                  if (Array.isArray(rd)) {
                    rd.forEach(deviceInfo => {
                      const points = deviceInfo.point_list || [];
                      points.forEach(p => {
                        if (p.point_id !== undefined) pointMap[String(p.point_id)] = parsePointValue(p.point_value);
                      });
                    });
                  }
                }
              }

              console.log(`[syncSungrow] ${devSn}: ${Object.keys(pointMap).length} points`);

              const gp = (id) => {
                const v = pointMap[String(id)];
                return v !== undefined ? Number(v) : 0;
              };

              const existing = await db.entities.Inverter.filter({ sungrow_device_sn: devSn });
              const existingInv = existing[0];
              
              let mpptStrings = [];
              let hasAnyActive = false;
              for (let i = 0; i < PV_VOLT.length; i++) {
                const v = gp(PV_VOLT[i]), a = gp(PV_CURR[i]);
                if (v !== 0 || a !== 0) {
                  hasAnyActive = true;
                  break;
                }
              }
              
              if (hasAnyActive) {
                for (let i = 0; i < PV_VOLT.length; i++) {
                  const v = gp(PV_VOLT[i]), a = gp(PV_CURR[i]);
                  if (v === 0 && a === 0) continue; // Skip unused strings during daytime
                  mpptStrings.push({ string_id: `PV${i+1}`, voltage_v: v, current_a: a, power_kw: parseFloat(((v*a)/1000).toFixed(3)) });
                }
              } else if (existingInv && existingInv.mppt_strings?.length > 0) {
                // Nighttime: preserve known strings but zero out values
                mpptStrings = existingInv.mppt_strings.map(s => ({ ...s, voltage_v: 0, current_a: 0, power_kw: 0 }));
              }

              const acPower      = gp(13003);
              const totalDcPower = mpptStrings.reduce((s, p) => s + p.power_kw, 0);
              const invData = {
                site_id:             site.id,
                name:                devSn || devId,
                model:               dev.dev_model || dev.model || '',
                rated_power_kw:      parseFloat(dev.dev_capacity || 0) || 0,
                current_ac_power_kw: acPower,
                current_dc_power_kw: totalDcPower,
                efficiency_percent:  totalDcPower > 0 ? parseFloat(((acPower/totalDcPower)*100).toFixed(1)) : 0,
                temperature_c:       pointMap['13150'] !== undefined ? (parseFloat(pointMap['13150']) || null) : null,
                status:              dev.dev_status === 1 || dev.dev_status === '1' ? 'online' : dev.dev_status === 2 || dev.dev_status === '2' ? 'warning' : 'offline',
                daily_yield_kwh:     gp(13119),
                mppt_strings:        mpptStrings,
                phase_voltages:      { l1: gp(13009), l2: gp(13010), l3: gp(13011) },
                sungrow_device_sn:   devSn,
                sungrow_device_id:   devId,
                sungrow_ps_key:      psKey
              };

              let invId = existing[0]?.id;
              if (existing.length > 0) {
                await db.entities.Inverter.update(existing[0].id, invData);
              } else {
                const newInv = await db.entities.Inverter.create(invData);
                invId = newInv.id;
              }
              
              if (invId) {
                try {
                   const now = new Date();
                   const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
                   const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).slice(0, 5);
                   const snaps = await db.entities.InverterGraphSnapshot.filter({ inverter_id: invId, date_key: todayKey });
                   const pt = { time: timeLabel, '13003': acPower, ...pointMap };
                   if (snaps.length > 0) {
                     const data = (snaps[0].data || []).filter(p => p.time !== timeLabel);
                     data.push(pt);
                     data.sort((a, b) => a.time.localeCompare(b.time));
                     await db.entities.InverterGraphSnapshot.update(snaps[0].id, { data });
                   } else {
                     await db.entities.InverterGraphSnapshot.create({
                       inverter_id: invId,
                       date_key: todayKey,
                       data: [pt]
                     });
                   }
                } catch (e) { console.log(`[syncSungrow] Inverter snapshot error: ${e.message}`); }
              }
              
              console.log(`[syncSungrow] Inverter ${devSn}: AC=${acPower}kW strings=${mpptStrings.length}`);
            }
          } catch (e) { console.log(`[syncSungrow] Inverter error ps_id=${psId}: ${e.message}`); }
        }

        await db.entities.ApiConnection.update(conn.id, { status: 'connected', last_sync: new Date().toISOString(), error_message: null });

      } catch (e) {
        console.error(`[syncSungrow] Conn ${conn.id} error: ${e.message}`);
        errors.push({ connection_id: conn.id, error: e.message });
        await db.entities.ApiConnection.update(conn.id, { status: 'error', error_message: e.message }).catch(() => {});
      }
    }

    return Response.json({ success: true, connections_synced: connections.length, sites_updated: totalUpdated, errors, synced_at: new Date().toISOString() });

  } catch (error) {
    console.error('[syncSungrow] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});