import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

const APP_KEY = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME = 'm.b.g.shilo@gmail.com';
const PASSWORD = 'Cesc2024';
const BASE_URL = 'http://openapi.inteless.com';

function buildSignedHeaders(method, path, contentType = '', contentMd5 = '') {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const headersToSign = `x-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}`;
  const textToSign = `${method}\n${contentType ? '*/*' : ''}\n${contentMd5}\n${contentType}\n\n${headersToSign}\n${path}`;
  const signature = createHmac('sha256', APP_SECRET).update(textToSign).digest('base64');
  return {
    'X-Ca-Key': APP_KEY,
    'X-Ca-Nonce': nonce,
    'X-Ca-Timestamp': timestamp,
    'X-Ca-Signature': signature,
    'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
    '_textToSign': textToSign
  };
}

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

async function apiGetSigned(token, path) {
  const hdrs = buildSignedHeaders('GET', path);
  const { _textToSign, ...signedHeaders } = hdrs;
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 
      ...signedHeaders,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json || text.substring(0, 300), textToSign: _textToSign };
}

async function apiGetSimple(token, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json || text.substring(0, 300) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { token, raw: loginRaw } = await login();
    if (!token) return Response.json({ error: 'Login failed', loginRaw }, { status: 500 });

    // Test endpoints with both signed and simple auth
    const [
      plantPageSigned, plantPageSimple,
      inverterListSigned, inverterListSimple,
      plantsSigned, plantsSimple,
      devicePageSigned
    ] = await Promise.all([
      apiGetSigned(token, '/v1/plant/page?pageNum=1&pageSize=10'),
      apiGetSimple(token, '/v1/plant/page?pageNum=1&pageSize=10'),
      apiGetSigned(token, '/v1/inverter/list?pageNum=1&pageSize=10'),
      apiGetSimple(token, '/v1/inverter/list?pageNum=1&pageSize=10'),
      apiGetSigned(token, '/v1/plants?page=1&size=10'),
      apiGetSimple(token, '/v1/plants?page=1&size=10'),
      apiGetSigned(token, '/v1/device/page?pageNum=1&pageSize=10'),
    ]);

    return Response.json({
      login: 'OK',
      token_preview: token.substring(0, 60) + '...',
      results: {
        '/v1/plant/page (signed)': plantPageSigned,
        '/v1/plant/page (simple)': plantPageSimple,
        '/v1/inverter/list (signed)': inverterListSigned,
        '/v1/inverter/list (simple)': inverterListSimple,
        '/v1/plants (signed)': plantsSigned,
        '/v1/plants (simple)': plantsSimple,
        '/v1/device/page (signed)': devicePageSigned,
      }
    });
  } catch (e) {
    return Response.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
});