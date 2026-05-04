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

    // Fetch daily energy with sno (station serial number) instead of id
    const endpoints = [
      { name: 'dayList_apr', ep: '/v1/api/stationDayEnergyList', body: { id: stationId, money: "ILS", time: "2025-04-01", pageNo: 1, pageSize: 100 } },
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

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});