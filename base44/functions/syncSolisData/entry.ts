import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

const SOLIS_KEY_ID = Deno.env.get("SOLIS_API_KEY_ID");
const SOLIS_KEY_SECRET = Deno.env.get("SOLIS_API_KEY_SECRET");
const SOLIS_BASE_URL = (Deno.env.get("SOLIS_API_URL") || "https://www.soliscloud.com:13333").replace(/\/$/, '');

const PAGE_SIZE = 10;

function getGMTDate() {
  return new Date().toUTCString().replace('UTC', 'GMT');
}
function md5Base64(str) {
  return createHash('md5').update(str, 'utf8').digest('base64');
}
function hmacSHA1Base64(secret, str) {
  return createHmac('sha1', secret).update(str, 'utf8').digest('base64');
}
function buildHeaders(endpoint, bodyStr) {
  const date = getGMTDate();
  const contentType = 'application/json';
  const contentMD5 = md5Base64(bodyStr);
  const signStr = `POST\n${contentMD5}\n${contentType}\n${date}\n${endpoint}`;
  const sign = hmacSHA1Base64(SOLIS_KEY_SECRET, signStr);
  return { 'Content-Type': contentType, 'Content-MD5': contentMD5, 'Date': date, 'Authorization': `API ${SOLIS_KEY_ID}:${sign}` };
}

async function solisPost(endpoint, body) {
  const bodyStr = JSON.stringify(body);
  const headers = buildHeaders(endpoint, bodyStr);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${SOLIS_BASE_URL}${endpoint}`, { method: 'POST', headers, body: bodyStr, signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Geocode address → lat/lng using Nominatim (free, no key needed)
async function geocodeAddress(addr) {
  if (!addr) return { lat: null, lng: null };
  try {
    const q = encodeURIComponent(addr + ', Israel');
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'User-Agent': 'DelkalEnergyApp/1.0' }
    });
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (_) {}
  return { lat: null, lng: null };
}

function guessRegion(s) {
  const text = ((s.cityStr || '') + ' ' + (s.regionStr || '') + ' ' + (s.addrOrigin || '')).toLowerCase();
  if (/eilat|arava|negev|beersheba|beer sheva|dimona/.test(text)) return 'arava';
  if (/haifa|nazareth|tiberias|afula|akko|nahariya|galilee|north/.test(text)) return 'north';
  if (/tel aviv|ramat|holon|bat yam|petah|rishon|rehovot|lod|ramla|herzliya|netanya|kfar saba|ra'anana|center/.test(text)) return 'center';
  if (/ashkelon|ashdod|kiryat gat|south/.test(text)) return 'south';
  return 'center';
}

async function mapStationToSite(s, existingLat, existingLng) {
  const stateMap = { 1: 'online', 2: 'offline', 3: 'warning', 4: 'offline' };

  // Try coordinates from Solis first, then fallback to geocoding if missing
  let lat = parseFloat(s.locationLat) || null;
  let lng = parseFloat(s.locationLng) || null;

  if ((!lat || !lng) && !(existingLat && existingLng)) {
    const addr = s.addrOrigin || s.cityStr;
    if (addr) {
      const geo = await geocodeAddress(addr);
      lat = geo.lat;
      lng = geo.lng;
    }
  } else if (!lat && existingLat) {
    lat = existingLat;
    lng = existingLng;
  }

  return {
    name: s.stationName,
    status: stateMap[s.state] || 'offline',
    dc_capacity_kwp: parseFloat(s.capacity) || 0,
    current_power_kw: parseFloat(s.power) || 0,
    daily_yield_kwh: parseFloat(s.dayEnergy) || 0,
    monthly_yield_kwh: parseFloat(s.monthEnergy) || 0,
    yearly_yield_kwh: parseFloat(s.yearEnergy) || 0,
    lifetime_yield_kwh: parseFloat(s.allEnergy) || 0,
    latitude: lat,
    longitude: lng,
    tariff_per_kwh: parseFloat(s.price) || 0,
    last_heartbeat: new Date().toISOString(),
    solis_station_id: s.id,
    solis_sno: s.sno,
    owner: 'delkal_energy',
    region_tag: guessRegion(s),
    azimuth_deg: parseFloat(s.azimuth) || null,
    tilt_deg: parseFloat(s.dip) || null,
    installation_date: s.installDate || null
  };
}

// Extract MPPT strings from inverter detail
// Solis API returns camelCase: uPv1, iPv1, uPv2, iPv2, etc.
function extractMpptStrings(detail) {
  const strings = [];
  if (!detail) return strings;

  // Solis API uses either camelCase (uPv1/iPv1) or snake_case (u_pv1/i_pv1)
  // Detect which format this inverter uses by checking the first key
  const useSnake = detail.hasOwnProperty('u_pv1');

  for (let i = 1; i <= 32; i++) {
    const keyV = useSnake ? `u_pv${i}` : `uPv${i}`;
    const keyA = useSnake ? `i_pv${i}` : `iPv${i}`;
    if (!detail.hasOwnProperty(keyV)) break;
    const v = parseFloat(detail[keyV]) || 0;
    const a = parseFloat(detail[keyA]) || 0;
    strings.push({
      string_id: `PV${i}`,
      voltage_v: v,
      current_a: a,
      power_kw: parseFloat(((v * a) / 1000).toFixed(3))
    });
  }
  // Trim trailing strings with 0 voltage (unused inputs)
  while (strings.length > 0 && strings[strings.length - 1].voltage_v === 0) {
    strings.pop();
  }
  return strings;
}

function extractPhaseVoltages(detail) {
  if (!detail) return {};
  // Solis returns uAc1, uAc2, uAc3 (or u_ac1, u_ac2, u_ac3)
  const useSnake = detail.hasOwnProperty('u_ac1');
  const l1 = parseFloat(useSnake ? detail.u_ac1 : detail.uAc1) || 0;
  const l2 = parseFloat(useSnake ? detail.u_ac2 : detail.uAc2) || 0;
  const l3 = parseFloat(useSnake ? detail.u_ac3 : detail.uAc3) || 0;
  return { l1, l2, l3 };
}

function mapInverterToEntity(inv, siteId, detail) {
  const stateMap = { 1: 'online', 2: 'offline', 3: 'warning' };
  const mpptStrings = extractMpptStrings(detail);
  const totalDcW = mpptStrings.reduce((s, x) => s + (x.power_kw * 1000), 0);
  const pacW = parseFloat(detail?.pac || inv.pac || 0) * 1000;
  const efficiency = totalDcW > 0 ? parseFloat(((pacW / totalDcW) * 100).toFixed(1)) : 0;
  return {
    site_id: siteId,
    name: inv.sn || inv.inverterId || 'Inverter',
    model: inv.model || detail?.model || '',
    rated_power_kw: parseFloat(inv.power) || 0,
    current_ac_power_kw: parseFloat(detail?.pac ?? inv.pac) || 0,
    current_dc_power_kw: parseFloat(totalDcW / 1000) || 0,
    efficiency_percent: efficiency,
    temperature_c: detail?.inverterTemperature ? parseFloat(detail.inverterTemperature) : null,
    status: stateMap[inv.state] || 'offline',
    daily_yield_kwh: parseFloat(detail?.eToday ?? inv.eday) || 0,
    mppt_strings: mpptStrings,
    phase_voltages: extractPhaseVoltages(detail),
    solis_inverter_id: inv.id,
    solis_sn: inv.sn
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    let pageNo = 1;
    try {
      const body = await req.json();
      if (body.pageNo) pageNo = body.pageNo;
    } catch (_) {}

    const res = await solisPost('/v1/api/userStationList', { pageNo, pageSize: PAGE_SIZE });
    if (!res.success || !res.data?.page?.records) {
      return Response.json({ error: 'Failed to fetch stations', raw: res }, { status: 500 });
    }

    const stations = res.data.page.records;
    const total = res.data.page.total;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    console.log(`[syncSolisData] Page ${pageNo}/${totalPages}: ${stations.length} stations`);

    let created = 0, updated = 0, invertersSync = 0;
    const now = new Date();
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
    const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).slice(0, 5);

    for (const station of stations) {
      const sitesQuery = await db.entities.Site.filter({ solis_station_id: station.id });
      const existing = sitesQuery.length > 0 ? sitesQuery[0] : null;
      const siteData = await mapStationToSite(station, existing?.latitude, existing?.longitude);
      let siteId;

      if (existing) {
        await db.entities.Site.update(existing.id, siteData);
        siteId = existing.id;
        updated++;
      } else {
        const newSite = await db.entities.Site.create(siteData);
        siteId = newSite.id;
        created++;
      }

      const invRes = await solisPost('/v1/api/inverterList', { pageNo: 1, pageSize: 50, stationId: station.id });
      const inverters = invRes?.data?.page?.records || [];

      await db.entities.Site.update(siteId, { num_inverters: inverters.length });

      // Update daily graph snapshot
      try {
        const currentPowerKw = parseFloat(siteData.current_power_kw) || 0;
        const snaps = await db.entities.SiteGraphSnapshot.filter({ station_id: station.id, date_key: dateKey });
        if (snaps.length > 0) {
          const pts = (snaps[0].data || []).filter(p => p.time !== timeLabel);
          if (currentPowerKw > 0) pts.push({ time: timeLabel, value: currentPowerKw });
          pts.sort((a, b) => a.time.localeCompare(b.time));
          await db.entities.SiteGraphSnapshot.update(snaps[0].id, { data: pts });
        } else {
          await db.entities.SiteGraphSnapshot.create({
            station_id: station.id,
            date_key: dateKey,
            data: currentPowerKw > 0 ? [{ time: timeLabel, value: currentPowerKw }] : []
          });
        }
      } catch (e) { console.log(`[syncSolisData] Snapshot error for ${station.id}: ${e.message}`); }

      for (const inv of inverters) {
        let detail = null;
        try {
          const detailRes = await solisPost('/v1/api/inverterDetail', { id: inv.id, sn: inv.sn });
          if (detailRes?.success) detail = detailRes.data;
        } catch (_) {}

        const invData = mapInverterToEntity(inv, siteId, detail);
        const invQuery = await db.entities.Inverter.filter({ solis_inverter_id: inv.id });
        const existingInv = invQuery.length > 0 ? invQuery[0] : null;

        let invId = existingInv?.id;
        if (existingInv) {
          await db.entities.Inverter.update(existingInv.id, invData);
        } else {
          const newInv = await db.entities.Inverter.create(invData);
          invId = newInv.id;
        }
        
        if (invId && detail) {
          try {
             const snaps = await db.entities.InverterGraphSnapshot.filter({ inverter_id: invId, date_key: dateKey });
             const pt = { time: timeLabel, ...detail };
             if (snaps.length > 0) {
               const data = (snaps[0].data || []).filter(p => p.time !== timeLabel);
               data.push(pt);
               data.sort((a, b) => a.time.localeCompare(b.time));
               await db.entities.InverterGraphSnapshot.update(snaps[0].id, { data });
             } else {
               await db.entities.InverterGraphSnapshot.create({
                 inverter_id: invId,
                 date_key: dateKey,
                 data: [pt]
               });
             }
          } catch (e) { console.log(`[syncSolisData] Inverter snapshot error: ${e.message}`); }
        }

        invertersSync++;
      }
    }

    if (pageNo < totalPages) {
      base44.asServiceRole.functions.invoke('syncSolisData', { pageNo: pageNo + 1 }).catch(() => {});
    }

    const summary = {
      success: true,
      page: pageNo,
      total_pages: totalPages,
      stations_on_page: stations.length,
      sites_created: created,
      sites_updated: updated,
      inverters_synced: invertersSync,
      more_pages: pageNo < totalPages,
      synced_at: new Date().toISOString()
    };

    console.log('[syncSolisData]', JSON.stringify(summary));
    return Response.json(summary);

  } catch (error) {
    console.error('[syncSolisData] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});