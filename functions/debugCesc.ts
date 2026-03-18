import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

const APP_KEY = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME = 'm.b.g.shilo@gmail.com';
const PASSWORD = 'Cesc2024';
const BASE_URL = 'http://openapi.inteless.com';

async function login() {
  const body = JSON.stringify({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: 'openapi' });
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
  return { token: data?.data?.access_token || data?.access_token, raw: data };
}

function buildGetHeaders(path) {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const textToSign = `GET\n*/*\n\n\n\nx-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}\n${path}`;
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

async function apiGet(token, path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
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
    return { status: res.status, body: json || text.substring(0, 300), errMsg, textToSign };
  } catch(e) {
    clearTimeout(timeout);
    return { error: e.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'login';

    const { token, raw: loginRaw } = await login();
    if (!token) return Response.json({ error: 'Login failed', loginRaw }, { status: 500 });

    if (mode === 'login') {
      return Response.json({ login: 'OK', token_preview: token.substring(0, 60), loginRaw });
    }

    if (mode === 'plant') {
      const result = await apiGet(token, '/v1/plant/page?pageNum=1&pageSize=10&lan=en');
      return Response.json({ path: '/v1/plant/page', result });
    }

    if (mode === 'inverter') {
      const plantId = body.plantId || '';
      const result = await apiGet(token, `/v1/inverter/list?pageNum=1&pageSize=10&lan=en${plantId ? '&plantId=' + plantId : ''}`);
      return Response.json({ path: '/v1/inverter/list', result });
    }

    if (mode === 'device') {
      const path = body.path || '/v1/device/page?pageNum=1&pageSize=10&lan=en';
      const result = await apiGet(token, path);
      return Response.json({ path, result });
    }

    return Response.json({ error: 'Unknown mode. Use: login, plant, inverter, device' });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});