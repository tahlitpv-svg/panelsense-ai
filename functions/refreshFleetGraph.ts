import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

const SOLIS_KEY_ID = Deno.env.get("SOLIS_API_KEY_ID");
const SOLIS_KEY_SECRET = Deno.env.get("SOLIS_API_KEY_SECRET");
const SOLIS_BASE_URL = (Deno.env.get("SOLIS_API_URL") || "https://www.soliscloud.com:13333").replace(/\/$/, '');

function getGMTDate() { return new Date().toUTCString().replace('UTC', 'GMT'); }
function md5Base64(str) { return createHash('md5').update(str, 'utf8').digest('base64'); }
function hmacSHA1Base64(secret, str) { return createHmac('sha1', secret).update(str, 'utf8').digest('base64'); }

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
  const res = await fetch(`${SOLIS_BASE_URL}${endpoint}`, { method: 'POST', headers, body: bodyStr });
  return res.json();
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function thisMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function fetchAndMerge(stationIds, timeframe) {
  const BATCH_SIZE = 3;
  const DELAY_MS = 400;
  const allResults = [];
  const dateStr = timeframe === 'hourly' ? todayStr() : thisMonthStr();

  for (let i = 0; i < stationIds.length; i += BATCH_SIZE) {
    const batch = stationIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (id, idx) => {
      await new Promise(r => setTimeout(r, idx * DELAY_MS));
      try {
        if (timeframe === 'hourly') {
          const data = await solisPost('/v1/api/stationDay', { id, time: dateStr, timezone: 2 });
          if (data?.success && data?.data) {
            return data.data.map(p => ({
              time: p.timeStr ? p.timeStr.split(' ')[1]?.slice(0, 5) : p.time,
              power: parseFloat((parseFloat(p.power || 0) / 1000).toFixed(3))
            }));
          }
        } else {
          const data = await solisPost('/v1/api/stationMonth', { id, month: dateStr, timezone: 2 });
          if (data?.success && data?.data) {
            return data.data.map(p => ({
              time: p.dateStr?.split('-')[2] || p.dateStr,
              power: parseFloat(p.energy || 0)
            }));
          }
        }
      } catch (_) {}
      return [];
    }));
    allResults.push(...results);
    if (i + BATCH_SIZE < stationIds.length) {
      await new Promise(r => setTimeout(r, 600));
    }
  }

  // Merge
  const map = {};
  allResults.forEach(arr => {
    (arr || []).forEach(item => {
      if (!item?.time) return;
      if (!map[item.time]) map[item.time] = { time: item.time, value: 0 };
      map[item.time].value += item.power || 0;
    });
  });

  return Object.values(map).sort((a, b) => a.time.localeCompare(b.time));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all stations from DB
    const sites = await base44.asServiceRole.entities.Site.list();
    const stationIds = sites.filter(s => s.solis_station_id).map(s => s.solis_station_id);

    if (stationIds.length === 0) {
      return Response.json({ message: 'No stations found' });
    }

    // Fetch sequentially to avoid rate limits (syncSolisData also runs concurrently)
    const hourlyData = await fetchAndMerge(stationIds, 'hourly');
    await new Promise(r => setTimeout(r, 2000)); // pause between timeframes
    const dailyData = await fetchAndMerge(stationIds, 'daily');

    const today = todayStr();
    const thisMonth = thisMonthStr();

    // Upsert hourly snapshot
    const existingHourly = await base44.asServiceRole.entities.FleetGraphSnapshot.filter({ timeframe: 'hourly', date_key: today });
    if (existingHourly.length > 0) {
      await base44.asServiceRole.entities.FleetGraphSnapshot.update(existingHourly[0].id, { data: hourlyData });
    } else {
      await base44.asServiceRole.entities.FleetGraphSnapshot.create({ timeframe: 'hourly', date_key: today, data: hourlyData });
    }

    // Upsert daily snapshot
    const existingDaily = await base44.asServiceRole.entities.FleetGraphSnapshot.filter({ timeframe: 'daily', date_key: thisMonth });
    if (existingDaily.length > 0) {
      await base44.asServiceRole.entities.FleetGraphSnapshot.update(existingDaily[0].id, { data: dailyData });
    } else {
      await base44.asServiceRole.entities.FleetGraphSnapshot.create({ timeframe: 'daily', date_key: thisMonth, data: dailyData });
    }

    return Response.json({
      success: true,
      hourly_points: hourlyData.length,
      daily_points: dailyData.length,
      synced_at: new Date().toISOString()
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});