import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

const SOLIS_KEY_ID = Deno.env.get("SOLIS_API_KEY_ID");
const SOLIS_KEY_SECRET = Deno.env.get("SOLIS_API_KEY_SECRET");
const SOLIS_BASE_URL = (Deno.env.get("SOLIS_API_URL") || "https://www.soliscloud.com:13333").replace(/\/$/, '');

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
  return {
    'Content-Type': contentType,
    'Content-MD5': contentMD5,
    'Date': date,
    'Authorization': `API ${SOLIS_KEY_ID}:${sign}`
  };
}

async function solisPost(endpoint, body) {
  const bodyStr = JSON.stringify(body);
  const headers = buildHeaders(endpoint, bodyStr);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${SOLIS_BASE_URL}${endpoint}`, {
      method: 'POST', headers, body: bodyStr, signal: controller.signal
    });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Fetch all stations (paginated)
async function fetchAllStations() {
  const stations = [];
  let pageNo = 1;
  const pageSize = 100;
  while (true) {
    const res = await solisPost('/v1/api/userStationList', { pageNo, pageSize });
    if (!res.success || !res.data?.page?.records) break;
    const records = res.data.page.records;
    stations.push(...records);
    if (stations.length >= res.data.page.total) break;
    pageNo++;
  }
  return stations;
}

// Fetch all inverters for a station
async function fetchInvertersForStation(stationId) {
  const res = await solisPost('/v1/api/inverterList', {
    pageNo: 1, pageSize: 100, stationId
  });
  if (!res.success || !res.data?.page?.records) return [];
  return res.data.page.records;
}

// Guess region_tag from city/region string
function guessRegion(s) {
  const text = ((s.cityStr || '') + ' ' + (s.regionStr || '') + ' ' + (s.addrOrigin || '')).toLowerCase();
  if (/eilat|arava|negev|beersheba|beer sheva|dimona/.test(text)) return 'arava';
  if (/haifa|nazareth|tiberias|afula|akko|nahariya|galilee|north/.test(text)) return 'north';
  if (/tel aviv|ramat|holon|bat yam|petah|rishon|rehovot|lod|ramla|herzliya|netanya|kfar saba|ra'anana|center/.test(text)) return 'center';
  if (/ashkelon|ashdod|kiryat gat|south/.test(text)) return 'south';
  return 'center'; // default
}

// Map solis station → Site entity fields
function mapStationToSite(s) {
  const stateMap = { 1: 'online', 2: 'offline', 3: 'warning', 4: 'offline' };
  return {
    name: s.stationName,
    status: stateMap[s.state] || 'offline',
    dc_capacity_kwp: parseFloat(s.capacity) || 0,
    current_power_kw: parseFloat(s.power) || 0,
    daily_yield_kwh: parseFloat(s.dayEnergy) || 0,
    monthly_yield_kwh: parseFloat(s.monthEnergy) || 0,
    yearly_yield_kwh: parseFloat(s.yearEnergy) || 0,
    lifetime_yield_kwh: parseFloat(s.allEnergy) || 0,
    latitude: parseFloat(s.locationLat) || null,
    longitude: parseFloat(s.locationLng) || null,
    tariff_per_kwh: parseFloat(s.price) || 0,
    last_heartbeat: new Date().toISOString(),
    solis_station_id: s.id,
    solis_sno: s.sno,
    owner: 'delkal_energy',
    region_tag: guessRegion(s)
  };
}

// Map solis inverter → Inverter entity fields
function mapInverterToEntity(inv, siteId) {
  const stateMap = { 1: 'online', 2: 'offline', 3: 'warning' };
  return {
    site_id: siteId,
    name: inv.inverterId || inv.sn,
    model: inv.model || '',
    rated_power_kw: parseFloat(inv.power) || 0,
    current_ac_power_kw: parseFloat(inv.pac) || 0,
    status: stateMap[inv.state] || 'offline',
    daily_yield_kwh: parseFloat(inv.eday) || 0,
    solis_inverter_id: inv.id,
    solis_sn: inv.sn
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // This function runs as service role (scheduled / webhook) - no user auth needed
    const db = base44.asServiceRole;

    console.log('[syncSolisData] Starting sync...');

    // 1. Fetch all stations from Solis
    const stations = await fetchAllStations();
    console.log(`[syncSolisData] Found ${stations.length} stations`);

    // 2. Load existing sites from DB (to match by solis_station_id)
    const existingSites = await db.entities.Site.list();
    const sitesBySolisId = {};
    for (const site of existingSites) {
      if (site.solis_station_id) sitesBySolisId[site.solis_station_id] = site;
    }

    let created = 0, updated = 0, invertersSync = 0;

    for (const station of stations) {
      const siteData = mapStationToSite(station);
      let siteId;

      if (sitesBySolisId[station.id]) {
        // Update existing site
        const existing = sitesBySolisId[station.id];
        await db.entities.Site.update(existing.id, siteData);
        siteId = existing.id;
        updated++;
      } else {
        // Create new site
        const newSite = await db.entities.Site.create(siteData);
        siteId = newSite.id;
        created++;
      }

      // 3. Fetch inverters for this station
      const inverters = await fetchInvertersForStation(station.id);

      // Load existing inverters for this site
      const existingInverters = await db.entities.Inverter.filter({ site_id: siteId });
      const invBySolisId = {};
      for (const inv of existingInverters) {
        if (inv.solis_inverter_id) invBySolisId[inv.solis_inverter_id] = inv;
      }

      for (const inv of inverters) {
        const invData = mapInverterToEntity(inv, siteId);
        if (invBySolisId[inv.id]) {
          await db.entities.Inverter.update(invBySolisId[inv.id].id, invData);
        } else {
          await db.entities.Inverter.create(invData);
        }
        invertersSync++;
      }
    }

    const summary = {
      success: true,
      stations_total: stations.length,
      sites_created: created,
      sites_updated: updated,
      inverters_synced: invertersSync,
      synced_at: new Date().toISOString()
    };

    console.log('[syncSolisData] Done:', JSON.stringify(summary));
    return Response.json(summary);

  } catch (error) {
    console.error('[syncSolisData] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});