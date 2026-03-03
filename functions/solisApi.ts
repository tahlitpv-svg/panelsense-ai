import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

const SOLIS_KEY_ID = Deno.env.get("SOLIS_API_KEY_ID");
const SOLIS_KEY_SECRET = Deno.env.get("SOLIS_API_KEY_SECRET");
const SOLIS_BASE_URL = Deno.env.get("SOLIS_API_URL") || "https://www.soliscloud.com:13333";

function getGMTDate() {
  return new Date().toUTCString().replace('UTC', 'GMT');
}

function md5Base64(body) {
  return createHash('md5').update(body).digest('base64');
}

function hmacSHA1Base64(secret, str) {
  return createHmac('sha1', secret).update(str).digest('base64');
}

function buildHeaders(endpoint, body) {
  const date = getGMTDate();
  const contentType = 'application/json';
  const contentMD5 = md5Base64(body);
  const signStr = `POST\n${contentMD5}\n${contentType}\n${date}\n${endpoint}`;
  const sign = hmacSHA1Base64(SOLIS_KEY_SECRET, signStr);
  const authorization = `API ${SOLIS_KEY_ID}:${sign}`;

  return {
    'Content-Type': contentType,
    'Content-MD5': contentMD5,
    'Date': date,
    'Authorization': authorization
  };
}

async function solisPost(endpoint, body) {
  const bodyStr = JSON.stringify(body);
  const headers = buildHeaders(endpoint, bodyStr);
  const baseUrl = SOLIS_BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}${endpoint}`;

  const res = await fetch(url, {
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
      const pageNo = params.pageNo || 1;
      const pageSize = params.pageSize || 100;
      const data = await solisPost('/v1/api/userStationList', { pageNo, pageSize });
      return Response.json(data);
    }

    if (action === 'getStationDetail') {
      const data = await solisPost('/v1/api/stationDetail', { id: params.stationId });
      return Response.json(data);
    }

    if (action === 'getStationDetailList') {
      // Batch get real-time data for multiple stations
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
      const data = await solisPost('/v1/api/inverterDetail', { id: params.inverterId, sn: params.sn });
      return Response.json(data);
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});