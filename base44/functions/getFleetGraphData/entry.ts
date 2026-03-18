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

// Fetch data for one station with delay to avoid rate limits
async function fetchWithDelay(fn, delayMs) {
  await new Promise(r => setTimeout(r, delayMs));
  return fn();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { stationIds, timeframe, dateStr } = await req.json();

    if (!stationIds || stationIds.length === 0) {
      return Response.json({ data: [] });
    }

    // Process stations in small batches with delays to avoid rate limiting
    const BATCH_SIZE = 3;
    const DELAY_MS = 300;
    const allResults = [];

    for (let i = 0; i < stationIds.length; i += BATCH_SIZE) {
      const batch = stationIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((id, idx) =>
          fetchWithDelay(async () => {
            try {
              if (timeframe === 'hourly') {
                const data = await solisPost('/v1/api/stationDay', { id, time: dateStr, timezone: 2 });
                if (data?.success && data?.data) {
                  return data.data.map(p => ({
                    time: p.timeStr ? p.timeStr.split(' ')[1]?.slice(0, 5) : p.time,
                    power: parseFloat((parseFloat(p.power || 0) / 1000).toFixed(3))
                  }));
                }
              } else if (timeframe === 'daily') {
                const data = await solisPost('/v1/api/stationMonth', { id, month: dateStr, timezone: 2 });
                if (data?.success && data?.data) {
                  return data.data.map(p => ({
                    date: p.dateStr?.split('-')[2] || p.dateStr,
                    energy: parseFloat(p.energy || 0)
                  }));
                }
              }
              return [];
            } catch (_) { return []; }
          }, idx * DELAY_MS)
        )
      );
      allResults.push(...batchResults);

      // Delay between batches
      if (i + BATCH_SIZE < stationIds.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Merge all results by key
    const map = {};
    const key = timeframe === 'hourly' ? 'time' : 'date';
    const valueKey = timeframe === 'hourly' ? 'power' : 'energy';

    allResults.forEach(arr => {
      (arr || []).forEach(item => {
        const k = item[key];
        if (!k) return;
        if (!map[k]) map[k] = { time: k, value: 0 };
        map[k].value += item[valueKey] || 0;
      });
    });

    const merged = Object.values(map).sort((a, b) => a.time.localeCompare(b.time));
    return Response.json({ data: merged });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});