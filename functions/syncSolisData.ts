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
// Solis API returns: u_pv1, i_pv1, pow1, u_pv2, i_pv2, pow2, etc.
function extractMpptStrings(detail) {
  const strings = [];
  if (!detail) return strings;
  for (let i = 1; i <= 16; i++) {
    const v = parseFloat(detail[`u_pv${i}`]);
    const a = parseFloat(detail[`i_pv${i}`]);
    const p = parseFloat(detail[`pow${i}`]);
    if (!isNaN(v) && v > 0) {
      strings.push({
        string_id: `PV${i}`,
        voltage_v: v,
        current_a: isNaN(a) ? 0 : a,
        power_kw: !isNaN(p) ? parseFloat((p / 1000).toFixed(3)) : parseFloat(((v * (isNaN(a) ? 0 : a)) / 1000).toFixed(3))
      });
    }
  }
  return strings;
}

function mapInverterToEntity(inv, siteId, detail) {
  const stateMap = { 1: 'online', 2: 'offline', 3: 'warning' };
  const mpptStrings = extractMpptStrings(detail);
  // Calculate efficiency: pac / (sum of all DC string powers)
  const totalDcW = mpptStrings.reduce((s, x) => s + (x.power_kw * 1000), 0);
  const pacW = parseFloat(detail?.pac || inv.pac || 0) * 1000;
  const efficiency = totalDcW > 0 ? parseFloat(((pacW / totalDcW) * 100).toFixed(1)) : 0;
  return {
    site_id: siteId,
    name: inv.sn || inv.inverterId || 'Inverter',
    model: inv.model || detail?.model || '',
    rated_power_kw: parseFloat(inv.power) || 0,
    current_ac_power_kw: parseFloat(inv.pac || detail?.pac) || 0,
    current_dc_power_kw: parseFloat(totalDcW / 1000) || 0,
    efficiency_percent: efficiency,
    temperature_c: detail?.inverterTemperature ? parseFloat(detail.inverterTemperature) : null,
    status: stateMap[inv.state] || 'offline',
    daily_yield_kwh: parseFloat(inv.eday || detail?.eToday) || 0,
    mppt_strings: mpptStrings,
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

    console.log(`[syncSolisData] Syncing page ${pageNo} (size ${PAGE_SIZE})...`);

    const res = await solisPost('/v1/api/userStationList', { pageNo, pageSize: PAGE_SIZE });
    if (!res.success || !res.data?.page?.records) {
      return Response.json({ error: 'Failed to fetch stations', raw: res }, { status: 500 });
    }

    const stations = res.data.page.records;
    const total = res.data.page.total;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    console.log(`[syncSolisData] Got ${stations.length} stations (total ${total}, page ${pageNo}/${totalPages})`);

    const existingSites = await db.entities.Site.list();
    const sitesBySolisId = {};
    for (const site of existingSites) {
      if (site.solis_station_id) sitesBySolisId[site.solis_station_id] = site;
    }

    let created = 0, updated = 0, invertersSync = 0;

    for (const station of stations) {
      const existing = sitesBySolisId[station.id];
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

      // Fetch inverter list for this station
      const invRes = await solisPost('/v1/api/inverterList', { pageNo: 1, pageSize: 50, stationId: station.id });
      const inverters = invRes?.data?.page?.records || [];

      // Update num_inverters on site
      await db.entities.Site.update(siteId, { num_inverters: inverters.length });

      const existingInverters = await db.entities.Inverter.filter({ site_id: siteId });
      const invBySolisId = {};
      for (const inv of existingInverters) {
        if (inv.solis_inverter_id) invBySolisId[inv.solis_inverter_id] = inv;
      }

      for (const inv of inverters) {
        // Fetch inverter detail for MPPT/temperature data
        let detail = null;
        try {
          const detailRes = await solisPost('/v1/api/inverterDetail', { id: inv.id, sn: inv.sn });
          if (detailRes?.success) detail = detailRes.data;
        } catch (_) {}

        const invData = mapInverterToEntity(inv, siteId, detail);

        if (invBySolisId[inv.id]) {
          await db.entities.Inverter.update(invBySolisId[inv.id].id, invData);
        } else {
          await db.entities.Inverter.create(invData);
        }
        invertersSync++;
      }
    }

    // Trigger next page if needed
    if (pageNo < totalPages) {
      base44.asServiceRole.functions.invoke('syncSolisData', { pageNo: pageNo + 1 }).catch(() => {});
      console.log(`[syncSolisData] Triggered next page: ${pageNo + 1}/${totalPages}`);
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

    console.log('[syncSolisData] Page done:', JSON.stringify(summary));
    return Response.json(summary);

  } catch (error) {
    console.error('[syncSolisData] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});