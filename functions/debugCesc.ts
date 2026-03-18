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

    // Try various endpoints
    const results = await Promise.all([
      apiGet(token, '/v1/plant/page'),
      apiGet(token, '/v1/plants'),
      apiGet(token, '/v1/station/list'),
      apiGet(token, '/v1/inverters'),
      apiGet(token, '/v1/device/list'),
      apiGet(token, '/v1/user/plant/list'),
      apiGet(token, '/v1/plant/page?pageNum=1&pageSize=10'),
      apiGet(token, '/v1/plants?page=1&size=10'),
    ]);

    const keys = ['/v1/plant/page','/v1/plants','/v1/station/list','/v1/inverters','/v1/device/list','/v1/user/plant/list','/v1/plant/page?pageNum=1&pageSize=10','/v1/plants?page=1&size=10'];
    const endpoints = {};
    keys.forEach((k, i) => endpoints[k] = results[i]);

    return Response.json({ login: 'OK', token_preview: token.substring(0, 50) + '...', endpoints });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});