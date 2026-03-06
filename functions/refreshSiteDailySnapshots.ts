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

function formatDateInTZ(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(date);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const forceAll = body.forceAll === true;

    const now = new Date();
    const hourJerusalem = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(now), 10);

    const todayKey = formatDateInTZ(now, 'Asia/Jerusalem');
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayKey = formatDateInTZ(yesterday, 'Asia/Jerusalem');
    const updateYesterdayToo = hourJerusalem <= 6;

    const sites = await base44.asServiceRole.entities.Site.list();
    const havingStation = (sites || []).filter(s => !!s.solis_station_id);

    // Process all sites every time (no waves)
    const selected = havingStation;

    async function fetchDayFromSolis(stationId, dateKey) {
      const data = await solisPost('/v1/api/stationDay', { id: stationId, time: dateKey, timezone: 2 });
      const raw = (data?.success && Array.isArray(data?.data)) ? data.data : [];

      const mapped = raw.map(item => {
        let label = '';
        if (item.timeStr) {
          const ts = item.timeStr.trim();
          const timeMatch = ts.match(/(\d{2}:\d{2})/);
          label = timeMatch ? timeMatch[1] : '';
        }
        const pec = parseFloat(item.powerPec) || 0.001;
        const valueKw = parseFloat(((parseFloat(item.power) || 0) * pec).toFixed(3));
        return { time: label, value: isFinite(valueKw) ? valueKw : 0 };
      }).filter(d => d.time !== '');

      mapped.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      return mapped;
    }

    let processed = 0;
    for (const site of selected) {
      const stationId = site.solis_station_id;
      if (!stationId) continue;

      const todayData = await fetchDayFromSolis(stationId, todayKey);
      const existingToday = await base44.asServiceRole.entities.SiteGraphSnapshot.filter({ station_id: stationId, date_key: todayKey });
      if (existingToday && existingToday[0]) {
        await base44.asServiceRole.entities.SiteGraphSnapshot.update(existingToday[0].id, { data: todayData });
      } else {
        await base44.asServiceRole.entities.SiteGraphSnapshot.create({ station_id: stationId, date_key: todayKey, data: todayData });
      }
      processed++;

      if (updateYesterdayToo) {
        const yData = await fetchDayFromSolis(stationId, yesterdayKey);
        const exY = await base44.asServiceRole.entities.SiteGraphSnapshot.filter({ station_id: stationId, date_key: yesterdayKey });
        if (exY && exY[0]) {
          await base44.asServiceRole.entities.SiteGraphSnapshot.update(exY[0].id, { data: yData });
        } else {
          await base44.asServiceRole.entities.SiteGraphSnapshot.create({ station_id: stationId, date_key: yesterdayKey, data: yData });
        }
      }

      // Small delay between sites to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    return Response.json({ success: true, processed, wave, totalSites: havingStation.length, selectedCount: selected.length, todayKey, updatedYesterday: updateYesterdayToo });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
});