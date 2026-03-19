import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

const SOLIS_KEY_ID = Deno.env.get('SOLIS_API_KEY_ID');
const SOLIS_KEY_SECRET = Deno.env.get('SOLIS_API_KEY_SECRET');
const SOLIS_BASE_URL = (Deno.env.get('SOLIS_API_URL') || 'https://www.soliscloud.com:13333').replace(/\/$/, '');

function getGMTDate() {
  return new Date().toUTCString().replace('UTC', 'GMT');
}

function md5Base64(str: string) {
  return createHash('md5').update(str, 'utf8').digest('base64');
}

function hmacSHA1Base64(secret: string, str: string) {
  return createHmac('sha1', secret).update(str, 'utf8').digest('base64');
}

function buildHeaders(endpoint: string, bodyStr: string) {
  if (!SOLIS_KEY_ID || !SOLIS_KEY_SECRET) {
    throw new Error('Server configuration error: SOLIS_API_KEY_ID / SOLIS_API_KEY_SECRET missing');
  }

  const date = getGMTDate();
  const contentType = 'application/json';
  const contentMD5 = md5Base64(bodyStr);
  const signStr = `POST\n${contentMD5}\n${contentType}\n${date}\n${endpoint}`;
  const sign = hmacSHA1Base64(SOLIS_KEY_SECRET, signStr);

  return {
    'Content-Type': contentType,
    'Content-MD5': contentMD5,
    'Date': date,
    Authorization: `API ${SOLIS_KEY_ID}:${sign}`,
  };
}

async function solisPost(endpoint: string, body: any) {
  const bodyStr = JSON.stringify(body ?? {});
  const headers = buildHeaders(endpoint, bodyStr);
  const url = `${SOLIS_BASE_URL}${endpoint}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: bodyStr, signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function extractResponseData(raw: any) {
  // Solis responses are inconsistent across endpoints; normalize to an array-ish `data` when possible.
  if (raw?.data?.page?.records && Array.isArray(raw.data.page.records)) return raw.data.page.records;
  if (raw?.data?.data && Array.isArray(raw.data.data)) return raw.data.data;
  if (raw?.data?.list && Array.isArray(raw.data.list)) return raw.data.list;
  if (Array.isArray(raw?.data)) return raw.data;
  return raw?.data ?? null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const endpoint = body?.endpoint;
    const payload = body?.body ?? {};

    if (typeof endpoint !== 'string' || !endpoint.startsWith('/v1/api/')) {
      return Response.json({ error: 'Invalid endpoint' }, { status: 400 });
    }

    const raw = await solisPost(endpoint, payload);
    const success = !!raw?.success;
    const data = extractResponseData(raw);

    return Response.json({ success, data });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});

