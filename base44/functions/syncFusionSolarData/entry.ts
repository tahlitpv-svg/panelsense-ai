import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ── Credentials ───────────────────────────────────────────────────────────────
const USERNAME   = 'tahlitpv_API';
const PASSWORD   = '1234qwer';
const API_BASE   = 'https://eu5.fusionsolar.huawei.com/thirdData';

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(): Promise<{ token: string; loginTime: number }> {
  const res  = await fetch(`${API_BASE}/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userName: USERNAME, systemCode: PASSWORD })
  });
  const data = await res.json();
  console.log(`[fusion] login status=${res.status} success=${data.success} failCode=${data.failCode}`);
  if (!data.success) throw new Error(`Login failed: failCode=${data.failCode} msg=${data.message}`);
  const token = res.headers.get('xsrf-token') || data.data?.xsrfToken || '';
  console.log(`[fusion] Login OK token=${token.slice(0, 20)}...`);
  return { token, loginTime: Date.now() };
}

// ── API POST ──────────────────────────────────────────────────────────────────
async function fsPost(token: string, endpoint: string, body: Record<string, any> = {}) {
  const res  = await fetch(`${API_BASE}/${endpoint}`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'xsrf-token':   token
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  console.log(`[fusion] POST ${endpoint} status=${res.status} body=${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return null; }
}

// ── Helper ────────────────────────────────────────────────────────────────────
function pf(v: any): number { return parseFloat(v) || 0; }

// Device type codes in FusionSolar Northbound API
const DEV_TYPE_INVERTER = 1;  // String inverter
const DEV_TYPE_RESIDENTIAL = 38; // Residential inverter

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db     = base44.asServiceRole;

    // 1. Login
    let { token, loginTime } = await login();

    // Helper to refresh token if needed (FusionSolar tokens expire after ~30 min)
    async function refreshIfNeeded() {
      if (Date.now() - loginTime > 25 * 60 * 1000) {
        console.log('[fusion] Token near expiry, refreshing...');
        const result = await login();
        token     = result.token;
        loginTime = result.loginTime;
      }
    }

    // 2. Get all stations (plants)
    const stationsRes = await fsPost(token, 'getStationList', {});
    const stations    = stationsRes?.data || [];
    console.log(`[fusion] ${stations.length} stations found`);

    let totalUpdated = 0;
    const errors: any[] = [];

    for (const station of stations) {
      const stationCode = station.stationCode || station.plantCode || '';
      const stationName = station.stationName || station.plantName || '';
      if (!stationCode) continue;

      console.log(`[fusion] Processing station "${stationName}" code=${stationCode}`);

      try {
        await refreshIfNeeded();

        // 3. Match site in DB by fusionsolar_station_code or name
        let site: any = null;
        const byCode = await db.entities.Site.filter({ fusionsolar_station_code: stationCode });
        if (byCode.length > 0) {
          site = byCode[0];
        } else {
          const all = await db.entities.Site.list();
          site = all.find((s: any) => s.name?.trim() === stationName.trim()) || null;
          if (site) {
            await db.entities.Site.update(site.id, { fusionsolar_station_code: stationCode });
            console.log(`[fusion] Matched site "${site.name}" by name`);
          }
        }

        // 4. Station real-time data
        const stationRt  = await fsPost(token, 'getStationRealKpi', { stationCodes: stationCode });
        const stData     = stationRt?.data?.[0] || {};
        const dataMap    = stData.dataItemMap || {};

        const currentPower = pf(dataMap.real_health_state !== undefined ? dataMap.day_power : dataMap.real_power || station.installedCapacity || 0);
        const dailyYield   = pf(dataMap.day_power || 0);
        const monthlyYield = pf(dataMap.month_power || 0);
        const totalYield   = pf(dataMap.total_power || 0);

        // Status from station real health state
        const healthState = stData.dataItemMap?.real_health_state;
        const status = healthState === 1 ? 'online'
                     : healthState === 2 ? 'warning'
                     : healthState === 3 ? 'offline'
                     : 'online';

        if (site) {
          await db.entities.Site.update(site.id, {
            current_power_kw:   currentPower,
            daily_yield_kwh:    dailyYield,
            monthly_yield_kwh:  monthlyYield,
            lifetime_yield_kwh: totalYield,
            status,
            last_heartbeat:     new Date().toISOString()
          });
          totalUpdated++;
          console.log(`[fusion] Site "${stationName}": power=${currentPower}kW daily=${dailyYield}kWh`);
        }

        // 5. Daily snapshot
        if (site) {
          try {
            const now       = new Date();
            const todayKey  = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
            const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).slice(0, 5);
            const snapId    = `fs_${stationCode}`;
            const powerKw   = parseFloat(currentPower.toFixed(3));
            const snaps     = await db.entities.SiteGraphSnapshot.filter({ station_id: snapId, date_key: todayKey });

            if (snaps.length > 0) {
              if (powerKw > 0 || snaps[0].data?.length > 0) {
                const pts = (snaps[0].data || []).filter((p: any) => p.time !== timeLabel);
                pts.push({ time: timeLabel, value: powerKw });
                pts.sort((a: any, b: any) => a.time.localeCompare(b.time));
                await db.entities.SiteGraphSnapshot.update(snaps[0].id, { daily_yield_kwh: dailyYield, data: pts });
              }
            } else {
              await db.entities.SiteGraphSnapshot.create({
                station_id:      snapId,
                date_key:        todayKey,
                daily_yield_kwh: dailyYield,
                data:            powerKw > 0 ? [{ time: timeLabel, value: powerKw }] : []
              });
            }
          } catch (e: any) { console.log(`[fusion] Snapshot error: ${e.message}`); }
        }

        // 6. Get devices (inverters) for this station
        await refreshIfNeeded();
        const devListRes = await fsPost(token, 'getDevList', { stationCodes: stationCode });
        const devices    = devListRes?.data || [];
        const inverters  = devices.filter((d: any) =>
          d.devTypeId === DEV_TYPE_INVERTER || d.devTypeId === DEV_TYPE_RESIDENTIAL
        );
        console.log(`[fusion] Station ${stationCode}: ${devices.length} devices, ${inverters.length} inverters`);

        if (inverters.length > 0) {
          // 7. Get real-time KPI for all inverters at once
          const devSnList = inverters.map((d: any) => d.devDn || d.sn || '').filter(Boolean).join(',');
          const devIds    = inverters.map((d: any) => d.id || d.devId || '').filter(Boolean).join(',');

          await refreshIfNeeded();
          const rtKpiRes = await fsPost(token, 'getDevRealKpi', {
            devIds:     devIds,
            devTypeId:  DEV_TYPE_INVERTER
          });
          const rtKpiData = rtKpiRes?.data || [];

          for (const inv of inverters) {
            try {
              const devId  = String(inv.id || inv.devId || '');
              const devSn  = String(inv.devDn || inv.sn || inv.snCode || '');
              const devName = inv.devName || inv.aliasName || devSn;
              if (!devId && !devSn) continue;

              // Find this inverter's real-time data
              const rtData    = rtKpiData.find((d: any) => String(d.devId) === devId || String(d.sn) === devSn) || {};
              const dataMap   = rtData.dataItemMap || {};

              const acPower   = pf(dataMap.active_power || 0);
              const etoday    = pf(dataMap.day_cap || 0);
              const etotal    = pf(dataMap.total_cap || 0);
              const temp      = dataMap.temperature !== undefined ? pf(dataMap.temperature) : null;
              const efficiency = pf(dataMap.efficiency || 0);

              // Phase voltages
              const phase_voltages = {
                l1: pf(dataMap.ab_u || dataMap.a_u || 0),
                l2: pf(dataMap.bc_u || dataMap.b_u || 0),
                l3: pf(dataMap.ca_u || dataMap.c_u || 0),
              };

              // MPPT strings (PV1-PV8)
              const mpptStrings: any[] = [];
              for (let i = 1; i <= 8; i++) {
                const v = pf(dataMap[`pv${i}_u`] || 0);
                const a = pf(dataMap[`pv${i}_i`] || 0);
                if (v === 0 && a === 0) continue;
                mpptStrings.push({
                  string_id: `PV${i}`,
                  voltage_v: v,
                  current_a: a,
                  power_kw:  parseFloat(((v * a) / 1000).toFixed(3))
                });
              }

              const totalDcPower = mpptStrings.reduce((s, p) => s + p.power_kw, 0);
              const devStatus    = inv.devStatus === 512 ? 'online'
                                 : inv.devStatus === 1024 ? 'warning'
                                 : 'offline';

              const invData = {
                site_id:             site?.id,
                name:                devName,
                model:               inv.devTypeId === DEV_TYPE_RESIDENTIAL ? 'Huawei Residential' : 'Huawei String Inverter',
                rated_power_kw:      pf(inv.capacity || 0),
                current_ac_power_kw: acPower,
                current_dc_power_kw: totalDcPower || pf(dataMap.mppt_power || 0),
                efficiency_percent:  efficiency,
                temperature_c:       temp,
                status:              devStatus,
                daily_yield_kwh:     etoday,
                mppt_strings:        mpptStrings,
                phase_voltages,
                fusionsolar_dev_id:  devId,
                fusionsolar_sn:      devSn,
              };

              const existing = await db.entities.Inverter.filter({ fusionsolar_dev_id: devId });
              if (existing.length > 0) {
                await db.entities.Inverter.update(existing[0].id, invData);
              } else {
                await db.entities.Inverter.create(invData);
              }
              console.log(`[fusion] Inverter "${devName}": AC=${acPower}kW strings=${mpptStrings.length} temp=${temp}°C`);

            } catch (e: any) {
              console.log(`[fusion] Inverter error: ${e.message}`);
              errors.push({ station: stationName, inverter: inv.devName, error: e.message });
            }
          }
        }

      } catch (e: any) {
        console.error(`[fusion] Station error "${stationName}": ${e.message}`);
        errors.push({ station: stationName, error: e.message });
      }
    }

    // Logout
    await fsPost(token, 'logout', {}).catch(() => {});
    console.log('[fusion] Logged out');

    return Response.json({
      success:          true,
      stations_synced:  stations.length,
      sites_updated:    totalUpdated,
      errors,
      synced_at:        new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[fusion] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});