import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

const SOLIS_KEY_ID = Deno.env.get("SOLIS_API_KEY_ID");
const SOLIS_KEY_SECRET = Deno.env.get("SOLIS_API_KEY_SECRET");
const SOLIS_BASE_URL = (Deno.env.get("SOLIS_API_URL") || "https://www.soliscloud.com:13333").replace(/\/$/, '');

const PAGE_SIZE = 10; // process 10 stations per run to stay within CPU limits

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

function guessRegion(s) {
  const text = ((s.cityStr || '') + ' ' + (s.regionStr || '') + ' ' + (s.addrOrigin || '')).toLowerCase();
  if (/eilat|arava|negev|beersheba|beer sheva|dimona/.test(text)) return 'arava';
  if (/haifa|nazareth|tiberias|afula|akko|nahariya|galilee|north/.test(text)) return 'north';
  if (/tel aviv|ramat|holon|bat yam|petah|rishon|rehovot|lod|ramla|herzliya|netanya|kfar saba|ra'anana|center/.test(text)) return 'center';
  if (/ashkelon|ashdod|kiryat gat|south/.test(text)) return 'south';
  return 'center';
}

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

function mapInverterToEntity(inv, siteId) {
  const stateMap = { 1: 'online', 2: 'offline', 3: 'warning' };
  return {
    site_id: siteId,
    name: inv.inverterId || inv.sn || 'Inverter',
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
    const db = base44.asServiceRole;

    // Read pageNo from payload (automation passes {} so we default to 1)
    let pageNo = 1;
    try {
      const body = await req.json();
      if (body.pageNo) pageNo = body.pageNo;
    } catch (_) { /* empty body is fine */ }

    console.log(`[syncSolisData] Syncing page ${pageNo} (size ${PAGE_SIZE})...`);

    // Fetch one page of stations
    const res = await solisPost('/v1/api/userStationList', { pageNo, pageSize: PAGE_SIZE });
    if (!res.success || !res.data?.page?.records) {
      return Response.json({ error: 'Failed to fetch stations', raw: res }, { status: 500 });
    }

    const stations = res.data.page.records;
    const total = res.data.page.total;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    console.log(`[syncSolisData] Got ${stations.length} stations (total ${total}, page ${pageNo}/${totalPages})`);

    // Load existing sites keyed by solis_station_id
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
        await db.entities.Site.update(sitesBySolisId[station.id].id, siteData);
        siteId = sitesBySolisId[station.id].id;
        updated++;
      } else {
        const newSite = await db.entities.Site.create(siteData);
        siteId = newSite.id;
        created++;
      }

      // Fetch inverters for this station
      const invRes = await solisPost('/v1/api/inverterList', { pageNo: 1, pageSize: 50, stationId: station.id });
      const inverters = invRes?.data?.page?.records || [];

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

    // If there are more pages, trigger next page automatically
    if (pageNo < totalPages) {
      // Fire-and-forget next page (no await - just trigger)
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