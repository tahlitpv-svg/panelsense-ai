import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

const APP_KEY = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME = 'm.b.g.shilo@gmail.com';
const PASSWORD = 'Cesc2024';
const BASE_URL = 'https://openapi.inteless.com';

async function login(clientId = 'csp-web') {
  const body = JSON.stringify({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: clientId });
  const md5 = createHash('md5').update(body).digest('base64');
  const nonce = crypto.randomUUID();
  const path = '/oauth/token';
  const textToSign = `POST\napplication/json\n${md5}\napplication/json\n\nx-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\n${path}`;
  const signature = createHmac('sha256', APP_SECRET).update(textToSign).digest('base64');

  const res = await fetch(`${BASE_URL}${path}`, {
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

async function apiGet(token, path, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const { headers: signedHeaders, textToSign } = buildGetHeaders(path);
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { ...signedHeaders, 'Authorization': `Bearer ${token}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const text = await res.text();
    const errMsg = res.headers.get('x-ca-error-message') || null;
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { label, path, status: res.status, errMsg, body: json || text.substring(0, 400), textToSign };
  } catch(e) {
    clearTimeout(timeout);
    return { label, path, error: e.message };
  }
}

async function apiPost(token, path, bodyObj, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const nonce = crypto.randomUUID();
    const timestamp = Date.now().toString();
    const bodyStr = JSON.stringify(bodyObj);
    const md5 = createHash('md5').update(bodyStr).digest('base64');
    const textToSign = `POST\n*/*\n${md5}\napplication/json\n\nx-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}\n${path}`;
    const signature = createHmac('sha256', APP_SECRET).update(textToSign).digest('base64');
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Content-MD5': md5,
        'X-Ca-Key': APP_KEY,
        'X-Ca-Nonce': nonce,
        'X-Ca-Timestamp': timestamp,
        'X-Ca-Signature': signature,
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
        'Authorization': `Bearer ${token}`
      },
      body: bodyStr,
      signal: controller.signal
    });
    clearTimeout(timeout);
    const text = await res.text();
    const errMsg = res.headers.get('x-ca-error-message') || null;
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { label, path, method: 'POST', status: res.status, errMsg, body: json || text.substring(0, 400), textToSign };
  } catch(e) {
    clearTimeout(timeout);
    return { label, path, method: 'POST', error: e.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Login with both client_ids
    const [loginCsp, loginOpenapi] = await Promise.all([
      login('csp-web'),
      login('openapi')
    ]);

    const loginReport = {
      'csp-web': { status: loginCsp.status, token_ok: !!loginCsp.token, token_preview: loginCsp.token?.substring(0,60), raw: loginCsp.raw },
      'openapi': { status: loginOpenapi.status, token_ok: !!loginOpenapi.token, token_preview: loginOpenapi.token?.substring(0,60), raw: loginOpenapi.raw }
    };

    const token = loginCsp.token || loginOpenapi.token;
    if (!token) {
      return Response.json({ login: loginReport, error: 'Both logins failed' });
    }

    // DNS/connectivity probe
    const probeUrls = [
      'https://openapi.inteless.com',
      'http://openapi.inteless.com',
      'https://openapi-as.inteless.com',
      'https://asia-openapi.inteless.com',
    ];

    const probes = await Promise.all(probeUrls.map(async url => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try {
        const r = await fetch(`${url}/v1/plant/list?lan=en&pageNum=1&pageSize=10`, {
          signal: ctrl.signal,
          headers: { 'Accept': '*/*' }
        });
        clearTimeout(t);
        const text = await r.text();
        return { url, http_status: r.status, body_preview: text.substring(0, 200) };
      } catch(e) {
        clearTimeout(t);
        return { url, error: e.message };
      }
    }));

    return Response.json({ base_url_used: BASE_URL, login_ok: true, probes });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});