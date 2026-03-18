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
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-MD5': md5, 'X-Ca-Key': APP_KEY, 'X-Ca-Nonce': nonce, 'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce', 'X-Ca-Signature': signature },
    body
  });
  const data = await res.json();
  return data?.data?.access_token;
}

async function apiGet(token, path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json || text.substring(0, 500) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = await login();
    if (!token) return Response.json({ error: 'Login failed' }, { status: 500 });

    // Try various endpoints to find the correct ones
    const [plants, inverters, devices, stations, v1Plants, v1Inverters] = await Promise.all([
      apiGet(token, '/plant/list'),
      apiGet(token, '/inverter/list'),
      apiGet(token, '/device/list'),
      apiGet(token, '/station/list'),
      apiGet(token, '/v1/plant/list'),
      apiGet(token, '/v1/inverter/list'),
    ]);

    return Response.json({
      login: 'OK',
      token_preview: token.substring(0, 50) + '...',
      endpoints: {
        '/plant/list': plants,
        '/inverter/list': inverters,
        '/device/list': devices,
        '/station/list': stations,
        '/v1/plant/list': v1Plants,
        '/v1/inverter/list': v1Inverters,
      }
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});