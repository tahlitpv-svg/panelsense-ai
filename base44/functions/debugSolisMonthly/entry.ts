import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createHmac, createHash } from 'node:crypto';

const SOLIS_KEY_ID = Deno.env.get('SOLIS_API_KEY_ID');
const SOLIS_KEY_SECRET = Deno.env.get('SOLIS_API_KEY_SECRET');
const SOLIS_BASE_URL = (Deno.env.get('SOLIS_API_URL') || 'https://www.soliscloud.com:13333').replace(/\/$/, '');

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
  const url = `${SOLIS_BASE_URL}${endpoint}`;
  console.log(`[debug] POST ${url} body=${bodyStr}`);
  const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
  const raw = await res.json();
  console.log(`[debug] response:`, JSON.stringify(raw).slice(0, 2000));
  return raw;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const stationId = "1298491919449964546";
    const results = {};

    // Try multiple endpoints to find which one returns monthly data
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    // stationYear returns daily data for the entire year for this specific station
    const endpoints = [
      { name: 'year2025', ep: '/v1/api/stationYear', body: { id: stationId, money: "ILS", year: "2025", nmiFlag: 0 } },
    ];

    for (const { name, ep, body } of endpoints) {
      try {
        await delay(1200);
        const raw = await solisPost(ep, body);
        results[name] = raw;
      } catch (e) {
        results[name] = { error: e.message };
      }
    }

    // stationYear returns an array directly in data (not records)
    const yearData = results.year2025?.data;
    const isArray = Array.isArray(yearData);
    
    // Summarize: group by month
    const monthSummary = {};
    const dataArr = isArray ? yearData : (yearData?.records || []);
    for (const r of dataArr) {
      const monthKey = (r.dateStr || '').substring(0, 7);
      if (!monthKey) continue;
      if (!monthSummary[monthKey]) monthSummary[monthKey] = { totalEnergy: 0, days: 0, sampleEnergyStr: r.energyStr, sampleEnergyPec: r.energyPec };
      monthSummary[monthKey].totalEnergy += (r.energy || 0);
      monthSummary[monthKey].days++;
    }
    
    return Response.json({ 
      isArray,
      totalDays: dataArr.length,
      monthSummary,
      sampleFirst: dataArr[0] ? { date: dataArr[0].dateStr, energy: dataArr[0].energy, energyStr: dataArr[0].energyStr, energyPec: dataArr[0].energyPec } : null,
      sampleLast: dataArr[dataArr.length-1] ? { date: dataArr[dataArr.length-1].dateStr, energy: dataArr[dataArr.length-1].energy, energyStr: dataArr[dataArr.length-1].energyStr, energyPec: dataArr[dataArr.length-1].energyPec } : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});