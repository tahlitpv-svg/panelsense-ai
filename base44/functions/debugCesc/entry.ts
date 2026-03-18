import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createHmac, createHash } from 'node:crypto';

const APP_KEY = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME = 'tahlitpv@gmail.com';
const PASSWORD = 'Cesc2024';
const AUTH_URL = 'https://pv.inteless.com';
const BASE_URL = 'https://pv.inteless.com/api';

// Simple login without HMAC signing
async function loginSimple(clientId) {
  const body = JSON.stringify({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: clientId });
  const res = await fetch(`${AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body
  });
  const data = await res.json();
  const token = data?.data?.access_token || data?.access_token;
  return { token, status: res.status, raw: data };
}

// Login with HMAC signing
async function loginSigned(clientId) {
  const body = JSON.stringify({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: clientId });
  const md5 = createHash('md5').update(body).digest('base64');
  const nonce = crypto.randomUUID();
  const path = '/oauth/token';
  const textToSign = `POST\napplication/json\n${md5}\napplication/json\n\nx-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\n${path}`;
  const signature = createHmac('sha256', APP_SECRET).update(textToSign).digest('base64');
  const res = await fetch(`${AUTH_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-MD5': md5,
      'X-Ca-Key': APP_KEY,
      'X-Ca-Nonce': nonce,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce',
      'X-Ca-Signature': signature
    },
    body
  });
  const data = await res.json();
  const token = data?.data?.access_token || data?.access_token;
  return { token, status: res.status, raw: data };
}

function sortedQueryPath(path) {
  const [base, query] = path.split('?');
  if (!query) return path;
  const sorted = query.split('&').sort().join('&');
  return `${base}?${sorted}`;
}

function buildGetHeaders(path) {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const signPath = sortedQueryPath(path);
  const textToSign = `GET\n*/*\n\n\n\nx-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}\n${signPath}`;
  const signature = createHmac('sha256', APP_SECRET).update(textToSign).digest('base64');
  return {
    headers: {
      'Accept': '*/*',
      'X-Ca-Key': APP_KEY,
      'X-Ca-Nonce': nonce,
      'X-Ca-Timestamp': timestamp,
      'X-Ca-Signature': signature,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
    },
    textToSign
  };
}

async function apiPost(token, path, body, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const text = await res.text();
    const errMsg = res.headers.get('x-ca-error-message') || null;
    const errCode = res.headers.get('x-ca-error-code') || null;
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { label, path, status: res.status, errMsg, errCode, body: json || text.substring(0, 400) };
  } catch(e) {
    clearTimeout(timeout);
    return { label, path, error: e.message };
  }
}

async function apiGet(token, path, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const { headers: signedHeaders, textToSign } = buildGetHeaders(path);
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { ...signedHeaders, 'Authorization': `Bearer ${token}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const text = await res.text();
    const errMsg = res.headers.get('x-ca-error-message') || null;
    const errCode = res.headers.get('x-ca-error-code') || null;
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { label, path, status: res.status, errMsg, errCode, body: json || text.substring(0, 400), textToSign };
  } catch(e) {
    clearTimeout(timeout);
    return { label, path, error: e.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Try all login variants
    const [l1, l2, l3, l4] = await Promise.all([
      loginSigned('csp-web'),
      loginSigned('openapi'),
      loginSimple('csp-web'),
      loginSimple('openapi'),
    ]);

    const loginReport = {
      'signed/csp-web':  { status: l1.status, token_ok: !!l1.token },
      'signed/openapi':  { status: l2.status, token_ok: !!l2.token },
      'simple/csp-web':  { status: l3.status, token_ok: !!l3.token },
      'simple/openapi':  { status: l4.status, token_ok: !!l4.token },
    };

    // Prefer openapi client_id token since it's what the API keys are registered for
    const token = l2.token || l4.token || l1.token || l3.token;
    if (!token) {
      return Response.json({ login: loginReport, error: 'All logins failed' });
    }

    const PLANT_ID = '191963';

    // Test with known plantId
    const results = await Promise.all([
      apiGet(token, `/v1/plant/list?pageNum=1&pageSize=10`, 'GET plant/list no params'),
      apiGet(token, `/v1/plant/${PLANT_ID}`, `GET plant by id`),
      apiGet(token, `/v1/plant/detail?plantId=${PLANT_ID}`, `GET plant/detail?plantId`),
      apiGet(token, `/v1/inverter/list?pageNum=1&pageSize=20&plantId=${PLANT_ID}`, `GET inverter/list + plantId`),
      apiGet(token, `/v1/inverter/list?pageNum=1&pageSize=20&stationId=${PLANT_ID}`, `GET inverter/list + stationId`),
      apiGet(token, `/v1/plant/realtime?plantId=${PLANT_ID}`, `GET plant/realtime`),
      apiGet(token, `/v1/plant/energy?plantId=${PLANT_ID}`, `GET plant/energy`),
    ]);

    return Response.json({
      login_summary: {
        'signed/csp-web': l1.token_ok || !!l1.token,
        'signed/openapi': l2.token_ok || !!l2.token,
        'simple/csp-web': l3.token_ok || !!l3.token,
        'simple/openapi': l4.token_ok || !!l4.token,
      },
      results: results.map(r => ({
        label: r.label,
        status: r.status,
        errMsg: r.errMsg,
        errCode: r.errCode,
        body: r.body,
        error: r.error || undefined
      }))
    });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});