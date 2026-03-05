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

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchDayFromSolis(stationId, dateKey) {
  const data = await solisPost('/v1/api/stationDay', { id: stationId, time: dateKey, timezone: 2 });
  const raw = (data?.success && Array.isArray(data?.data)) ? data.data : [];

  const mapped = raw.map(item => {
    let label = '';
    if (item.timeStr) {
      const ts = item.timeStr.trim();
      label = ts.includes(' ') ? (ts.split(' ')[1]?.slice(0, 5) || '') : ts.slice(0, 5);
    }
    const valueKw = parseFloat(((parseFloat(item.power) || 0) / 1000).toFixed(2));
    return { time: label, value: isFinite(valueKw) ? valueKw : 0 };
  }).filter(d => d.time !== '');

  mapped.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  return mapped;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    // Optional params: siteId (single site), daysBack (default 365)
    const daysBack = body.daysBack || 365;
    const targetSiteId = body.siteId || null;

    const sites = await base44.asServiceRole.entities.Site.list();
    const havingStation = (sites || []).filter(s => !!s.solis_station_id);
    const toProcess = targetSiteId 
      ? havingStation.filter(s => s.id === targetSiteId || s.solis_station_id === targetSiteId)
      : havingStation;

    if (toProcess.length === 0) {
      return Response.json({ success: false, error: 'No sites found' });
    }

    // Get all existing snapshots to know what we already have
    const allSnapshots = await base44.asServiceRole.entities.SiteGraphSnapshot.list('-created_date', 10000);
    const existingKeys = new Set();
    for (const snap of (allSnapshots || [])) {
      existingKeys.add(`${snap.station_id}__${snap.date_key}`);
    }

    const today = new Date();
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalEmpty = 0;
    const errors = [];

    for (const site of toProcess) {
      const stationId = site.solis_station_id;
      const installDate = site.installation_date ? new Date(site.installation_date) : null;
      
      // Go back daysBack days, but not before installation date
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - daysBack);
      
      const effectiveStart = installDate && installDate > startDate ? installDate : startDate;

      console.log(`Processing site ${site.name} (${stationId}), from ${formatDate(effectiveStart)} to ${formatDate(today)}`);

      const currentDate = new Date(effectiveStart);
      while (currentDate <= today) {
        const dateKey = formatDate(currentDate);
        const key = `${stationId}__${dateKey}`;

        if (existingKeys.has(key)) {
          totalSkipped++;
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        try {
          const dayData = await fetchDayFromSolis(stationId, dateKey);
          
          if (dayData.length === 0) {
            totalEmpty++;
          } else {
            await base44.asServiceRole.entities.SiteGraphSnapshot.create({
              station_id: stationId,
              date_key: dateKey,
              data: dayData
            });
            totalCreated++;
            existingKeys.add(key);
          }
        } catch (err) {
          errors.push(`${stationId} ${dateKey}: ${err.message}`);
        }

        // Rate limit: 400ms between API calls
        await new Promise(r => setTimeout(r, 400));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      console.log(`Done site ${site.name}. Created: ${totalCreated}, Skipped: ${totalSkipped}`);
    }

    return Response.json({
      success: true,
      sites_processed: toProcess.length,
      days_created: totalCreated,
      days_skipped_existing: totalSkipped,
      days_empty: totalEmpty,
      errors: errors.slice(0, 20)
    });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
});