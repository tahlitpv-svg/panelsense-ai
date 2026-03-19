import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const USERNAME = Deno.env.get('FUSIONSOLAR_USERNAME') || '';
const PASSWORD = Deno.env.get('FUSIONSOLAR_PASSWORD') || '';
const API_BASE = 'https://uni004eu5.fusionsolar.huawei.com/thirdData';

// Device type IDs
const DEV_INVERTER    = 1;   // String inverter
const DEV_RESIDENTIAL = 38;  // Residential inverter
const DEV_BATTERY     = 39;  // Residential battery
const DEV_ESS         = 41;  // C&I ESS

async function login() {
  const res  = await fetch(`${API_BASE}/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userName: USERNAME, systemCode: PASSWORD })
  });
  const data = await res.json();
  console.log(`[fusion] login success=${data.success} failCode=${data.failCode}`);
  if (!data.success) throw new Error(`Login failed: failCode=${data.failCode}`);
  const token = res.headers.get('xsrf-token') || data.data?.xsrfToken || data.xsrfToken || '';
  if (!token) throw new Error('No xsrf-token in login response');
  console.log('[fusion] Login OK');
  return { token, loginTime: Date.now() };
}

async function fsPost(token, endpoint, body = {}) {
  const res  = await fetch(`${API_BASE}/${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'xsrf-token': token },
    body:    JSON.stringify(body)
  });
  const text = await res.text();
  console.log(`[fusion] ${endpoint} status=${res.status} body=${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return null; }
}

function pf(v) { return v !== null && v !== undefined ? (parseFloat(v) || 0) : 0; }

// health_state: 1=disconnected, 2=faulty, 3=healthy
function stationStatus(healthState) {
  const h = parseInt(healthState);
  if (h === 3) return 'online';
  if (h === 2) return 'warning';
  return 'offline';
}

// inverter_state: 512=grid-connected, 513/514=limited, 768+=shutdown
function inverterStatus(invState) {
  const s = parseInt(invState);
  if (s === 512 || s === 513 || s === 514) return 'online';
  if (s >= 768 && s < 1024) return 'warning';
  return 'offline';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db     = base44.asServiceRole;

    // 1. Login
    let { token, loginTime } = await login();

    async function refreshIfNeeded() {
      if (Date.now() - loginTime > 25 * 60 * 1000) {
        const r = await login();
        token = r.token;
        loginTime = r.loginTime;
      }
    }

    // 2. Get station list
    const stationsRes = await fsPost(token, 'getStationList', {});
    const stations    = stationsRes?.data || [];
    console.log(`[fusion] ${stations.length} stations`);

    let totalUpdated = 0;
    const errors = [];

    for (const station of stations) {
      const stationCode = station.stationCode || station.plantCode || '';
      const stationName = station.stationName || station.plantName || '';
      if (!stationCode) continue;

      console.log(`[fusion] Station "${stationName}" code=${stationCode}`);

      try {
        await refreshIfNeeded();

        // 3. Match site in DB
        let site = null;
        const byCode = await db.entities.Site.filter({ fusionsolar_station_code: stationCode });
        if (byCode.length > 0) {
          site = byCode[0];
        } else {
          const all = await db.entities.Site.list();
          site = all.find((s) => s.name?.trim() === stationName.trim()) || null;
          if (site) await db.entities.Site.update(site.id, { fusionsolar_station_code: stationCode });
        }

        // 4. Real-time station KPIs
        const rtRes  = await fsPost(token, 'getStationRealKpi', { stationCodes: stationCode });
        const rtData = rtRes?.data?.find((d) => d.stationCode === stationCode) || {};
        const dm     = rtData.dataItemMap || {};

        const dailyYield   = pf(dm.day_power);
        const monthlyYield = pf(dm.month_power);
        const totalYield   = pf(dm.total_power);
        const status       = stationStatus(dm.real_health_state);

        if (site) {
          await db.entities.Site.update(site.id, {
            daily_yield_kwh:    dailyYield,
            monthly_yield_kwh:  monthlyYield,
            lifetime_yield_kwh: totalYield,
            status,
            last_heartbeat:     new Date().toISOString()
          });
          totalUpdated++;
          console.log(`[fusion] Site "${stationName}": daily=${dailyYield}kWh status=${status}`);
        }

        // 5. Daily snapshot
        if (site) {
          try {
            const now       = new Date();
            const todayKey  = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
            const snapId    = `fs_${stationCode}`;
            const snaps     = await db.entities.SiteGraphSnapshot.filter({ station_id: snapId, date_key: todayKey });
            if (snaps.length === 0) {
              await db.entities.SiteGraphSnapshot.create({ station_id: snapId, date_key: todayKey, daily_yield_kwh: dailyYield, data: [] });
            }
          } catch (e) { console.log(`[fusion] Snapshot error: ${e.message}`); }
        }

        // 6. Get device list
        await refreshIfNeeded();
        const devRes  = await fsPost(token, 'getDevList', { stationCodes: stationCode });
        const devices = devRes?.data || [];
        console.log(`[fusion] Station ${stationCode}: ${devices.length} devices`);

        const inverters = devices.filter((d) => d.devTypeId === DEV_INVERTER || d.devTypeId === DEV_RESIDENTIAL);
        const batteries = devices.filter((d) => d.devTypeId === DEV_BATTERY || d.devTypeId === DEV_ESS);

        // 7. Real-time inverter data
        let totalPowerKw = 0;

        if (inverters.length > 0) {
          const strInvs = inverters.filter((d) => d.devTypeId === DEV_INVERTER);
          const resInvs = inverters.filter((d) => d.devTypeId === DEV_RESIDENTIAL);

          const rtInvData = [];

          if (strInvs.length > 0) {
            await refreshIfNeeded();
            const r = await fsPost(token, 'getDevRealKpi', { devIds: strInvs.map((d) => d.id).join(','), devTypeId: DEV_INVERTER });
            if (r?.data) rtInvData.push(...r.data);
          }
          if (resInvs.length > 0) {
            await refreshIfNeeded();
            const r = await fsPost(token, 'getDevRealKpi', { devIds: resInvs.map((d) => d.id).join(','), devTypeId: DEV_RESIDENTIAL });
            if (r?.data) rtInvData.push(...r.data);
          }

          for (const inv of inverters) {
            try {
              const devId   = String(inv.id || inv.devId || '');
              const devDn   = String(inv.devDn || inv.devNaturalKey || '');
              const devName = inv.devName || inv.aliasName || devDn;

              const rtEntry = rtInvData.find((d) => String(d.devId) === devId) || {};
              const dm2     = rtEntry.dataItemMap || {};

              const acPower    = pf(dm2.active_power);
              const etoday     = pf(dm2.day_cap);
              const efficiency = pf(dm2.efficiency);
              const temp       = dm2.temperature !== undefined ? pf(dm2.temperature) : null;
              const invState   = dm2.inverter_state;
              const devStatus  = inverterStatus(invState);

              totalPowerKw += acPower;

              // Phase voltages
              const phase_voltages = {
                l1: pf(dm2.a_u || dm2.ab_u || 0),
                l2: pf(dm2.b_u || dm2.bc_u || 0),
                l3: pf(dm2.c_u || dm2.ca_u || 0),
              };

              // MPPT strings PV1-PV36
              const mpptStrings = [];
              for (let i = 1; i <= 36; i++) {
                const v = pf(dm2[`pv${i}_u`] || 0);
                const a = pf(dm2[`pv${i}_i`] || 0);
                if (v === 0 && a === 0) continue;
                mpptStrings.push({
                  string_id: `PV${i}`,
                  voltage_v: v,
                  current_a: a,
                  power_kw:  parseFloat(((v * a) / 1000).toFixed(3))
                });
              }

              const totalDcPower = pf(dm2.mppt_power) || mpptStrings.reduce((s, p) => s + p.power_kw, 0);

              const invData = {
                site_id:             site?.id,
                name:                devName,
                model:               inv.devTypeId === DEV_RESIDENTIAL ? 'Huawei Residential Inverter' : 'Huawei String Inverter',
                rated_power_kw:      pf(inv.capacity || 0),
                current_ac_power_kw: acPower,
                current_dc_power_kw: totalDcPower,
                efficiency_percent:  efficiency,
                temperature_c:       temp,
                status:              devStatus,
                daily_yield_kwh:     etoday,
                mppt_strings:        mpptStrings,
                phase_voltages,
                fusionsolar_dev_id:  devId,
                fusionsolar_sn:      devDn,
              };

              const existing = await db.entities.Inverter.filter({ fusionsolar_dev_id: devId });
              if (existing.length > 0) await db.entities.Inverter.update(existing[0].id, invData);
              else await db.entities.Inverter.create(invData);

              console.log(`[fusion] Inverter "${devName}": AC=${acPower}kW strings=${mpptStrings.length} temp=${temp}°C status=${devStatus}`);

            } catch (e) {
              errors.push({ station: stationName, inverter: inv.devName, error: e.message });
            }
          }
        }

        // 8. Update site current power from sum of inverters + snapshot
        if (site && totalPowerKw > 0) {
          await db.entities.Site.update(site.id, { current_power_kw: totalPowerKw });

          try {
            const now       = new Date();
            const todayKey  = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
            const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).slice(0, 5);
            const snapId    = `fs_${stationCode}`;
            const powerKw   = parseFloat(totalPowerKw.toFixed(3));
            const snaps     = await db.entities.SiteGraphSnapshot.filter({ station_id: snapId, date_key: todayKey });
            if (snaps.length > 0) {
              const pts = (snaps[0].data || []).filter((p) => p.time !== timeLabel);
              pts.push({ time: timeLabel, value: powerKw });
              pts.sort((a, b) => a.time.localeCompare(b.time));
              await db.entities.SiteGraphSnapshot.update(snaps[0].id, { data: pts, daily_yield_kwh: dailyYield });
            }
          } catch (e) { console.log(`[fusion] Snapshot update error: ${e.message}`); }
        }

        // 9. Battery data
        if (batteries.length > 0 && site) {
          await refreshIfNeeded();
          const batIds = batteries.map((d) => d.id).filter(Boolean).join(',');
          const batTypeId = batteries[0].devTypeId;
          const batRt = await fsPost(token, 'getDevRealKpi', { devIds: batIds, devTypeId: batTypeId });
          const batData = batRt?.data?.[0]?.dataItemMap || {};

          const batterySoc   = pf(batData.battery_soc);
          const batteryPower = pf(batData.ch_discharge_power) / 1000;

          if (batterySoc > 0) {
            console.log(`[fusion] Battery: SOC=${batterySoc}% power=${batteryPower}kW`);
          }
        }

      } catch (e) {
        console.error(`[fusion] Station error "${stationName}": ${e.message}`);
        errors.push({ station: stationName, error: e.message });
      }
    }

    // Logout
    await fsPost(token, 'logout', {}).catch(() => {});

    return Response.json({
      success:          true,
      stations_synced:  stations.length,
      sites_updated:    totalUpdated,
      errors,
      synced_at:        new Date().toISOString()
    });

  } catch (error) {
    console.error('[fusion] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});