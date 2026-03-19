import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createHmac, createHash } from 'node:crypto';

const APP_KEY = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME = 'm.b.g.shilo@gmail.com';
const PASSWORD = 'Cesc2024';
const AUTH_URL = 'https://pv.inteless.com';
const BASE_URL = 'https://pv.inteless.com/api';
const PLANT_ID = '191963';

// Simple login without HMAC signing
async function loginSimple(clientId) {
  const body = JSON.stringify({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: clientId });
  const res = await fetch(`${AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw_text: text.substring(0, 300) }; }
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
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw_text: text.substring(0, 300) }; }
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
  // Per official docs: GET signature includes accept, content-md5 of empty body
  const emptyMd5 = createHash('md5').update('').digest('base64');
  const signatureHeaders = 'x-ca-key,x-ca-nonce,x-ca-timestamp';
  const textToSign = `GET\napplication/json\n${emptyMd5}\napplication/json\n\nx-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}\n${signPath}`;
  const signature = createHmac('sha256', APP_SECRET).update(textToSign).digest('base64');
  return {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Content-MD5': emptyMd5,
      'X-Ca-Key': APP_KEY,
      'X-Ca-Nonce': nonce,
      'X-Ca-Timestamp': timestamp,
      'X-Ca-Signature': signature,
      'X-Ca-Signature-Headers': signatureHeaders,
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
      'signed/csp-web':  { status: l1.status, token_ok: !!l1.token, raw: l1.raw },
      'signed/openapi':  { status: l2.status, token_ok: !!l2.token, raw: l2.raw },
      'simple/csp-web':  { status: l3.status, token_ok: !!l3.token, raw: l3.raw },
      'simple/openapi':  { status: l4.status, token_ok: !!l4.token, raw: l4.raw },
    };

    // Prefer csp-web token to avoid "No Permissions"
    const token = l1.token || l3.token || l2.token || l4.token;
    if (!token) {
      return Response.json({ login: loginReport, error: 'All logins failed' });
    }

    const results = await Promise.all([
      apiGet(token, `/v1/plants?page=1&limit=100&lan=en`, `GET /v1/plants`),
      apiGet(token, `/v1/plant/list?page=1&limit=100`, `GET /v1/plant/list`),
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