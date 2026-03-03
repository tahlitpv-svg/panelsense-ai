import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const SOLIS_KEY_ID = Deno.env.get("SOLIS_API_KEY_ID");
const SOLIS_KEY_SECRET = Deno.env.get("SOLIS_API_KEY_SECRET");
const SOLIS_BASE_URL = (Deno.env.get("SOLIS_API_URL") || "https://www.soliscloud.com:13333").replace(/\/$/, '');

function getGMTDate() {
  return new Date().toUTCString().replace('UTC', 'GMT');
}

async function md5Base64(str) {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const bytes = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...bytes));
}

async function hmacSHA1Base64(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function buildHeaders(endpoint, bodyStr) {
  const date = getGMTDate();
  const contentType = 'application/json';
  const contentMD5 = await md5Base64(bodyStr);
  const signStr = `POST\n${contentMD5}\n${contentType}\n${date}\n${endpoint}`;
  const sign = await hmacSHA1Base64(SOLIS_KEY_SECRET, signStr);
  return {
    'Content-Type': contentType,
    'Content-MD5': contentMD5,
    'Date': date,
    'Authorization': `API ${SOLIS_KEY_ID}:${sign}`
  };
}

async function solisPost(endpoint, body) {
  const bodyStr = JSON.stringify(body);
  const headers = await buildHeaders(endpoint, bodyStr);
  const res = await fetch(`${SOLIS_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: bodyStr
  });
  return await res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();

    if (action === 'getStationList') {
      const data = await solisPost('/v1/api/userStationList', {
        pageNo: params.pageNo || 1,
        pageSize: params.pageSize || 100
      });
      return Response.json(data);
    }

    if (action === 'getStationDetail') {
      const data = await solisPost('/v1/api/stationDetail', { id: params.stationId });
      return Response.json(data);
    }

    if (action === 'getStationDetailList') {
      const data = await solisPost('/v1/api/stationDetailList', {
        pageNo: params.pageNo || 1,
        pageSize: params.pageSize || 100
      });
      return Response.json(data);
    }

    if (action === 'getInverterList') {
      const data = await solisPost('/v1/api/inverterList', {
        pageNo: params.pageNo || 1,
        pageSize: params.pageSize || 100,
        stationId: params.stationId
      });
      return Response.json(data);
    }

    if (action === 'getInverterDetail') {
      const data = await solisPost('/v1/api/inverterDetail', {
        id: params.inverterId,
        sn: params.sn
      });
      return Response.json(data);
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});