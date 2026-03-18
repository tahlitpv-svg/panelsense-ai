import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createHmac, createHash } from 'node:crypto';

async function cescLogin(appKey, appSecret, username, password) {
  const body = JSON.stringify({ username, password, grant_type: 'password', client_id: 'openapi' });
  const md5 = createHash('md5').update(body).digest('base64');
  const nonce = crypto.randomUUID();
  const path = '/oauth/token';
  const textToSign = `POST\napplication/json\n${md5}\napplication/json\n\nx-ca-key:${appKey}\nx-ca-nonce:${nonce}\n${path}`;
  const signature = createHmac('sha256', appSecret).update(textToSign).digest('base64');

  const res = await fetch(`https://pv.inteless.com${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-MD5': md5,
      'X-Ca-Key': appKey,
      'X-Ca-Nonce': nonce,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce',
      'X-Ca-Signature': signature
    },
    body
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Login error: ${text.substring(0, 200)}`); }
  const token = data?.data?.access_token || data?.access_token;
  if (!token) throw new Error('Login failed');
  return token;
}

function buildGetHeaders(path, appKey, appSecret) {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const emptyMd5 = createHash('md5').update('').digest('base64');
  const [base, query] = path.split('?');
  const sortedPath = query ? `${base}?${query.split('&').sort().join('&')}` : path;
  const textToSign = `GET\napplication/json\n${emptyMd5}\napplication/json\n\nx-ca-key:${appKey}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}\n${sortedPath}`;
  const signature = createHmac('sha256', appSecret).update(textToSign).digest('base64');
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-MD5': emptyMd5,
    'X-Ca-Key': appKey,
    'X-Ca-Nonce': nonce,
    'X-Ca-Timestamp': timestamp,
    'X-Ca-Signature': signature,
    'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
  };
}

async function cescGet(token, path, appKey, appSecret) {
  const headers = { ...buildGetHeaders(path, appKey, appSecret), 'Authorization': `Bearer ${token}` };
  const res = await fetch(`https://pv.inteless.com/api${path}`, { headers });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    
    const { plant_id, timeframe, date } = await req.json();
    if (!plant_id) throw new Error('Missing plant_id');

    // Find the CESC connection
    const conns = await db.entities.ApiConnection.filter({ provider: 'cesc' });
    if (!conns.length) throw new Error('No CESC connection');
    
    const conn = conns[0];
    const { app_key, app_secret, user_account, user_password } = conn.config || {};
    if (!app_key || !app_secret || !user_account || !user_password) {
      throw new Error('Missing CESC credentials');
    }

    const token = await cescLogin(app_key, app_secret, user_account, user_password);
    console.log('[DEBUG] CESC login successful, token:', token.substring(0, 20) + '...');

    // Get device/inverter list for the plant
    const devRes = await cescGet(token, `/v1/plants/${plant_id}/devices`, app_key, app_secret);
    console.log('[DEBUG] Device response:', JSON.stringify(devRes).substring(0, 500));
    
    const devices = devRes?.data?.infos || [];
    const inverters = devices.filter(d => d.device_type === 1);
    console.log('[DEBUG] Found inverters:', inverters.length);

    if (!inverters.length) {
      console.log('[DEBUG] No inverters found for plant', plant_id);
      return Response.json({ success: true, data: [] });
    }

    const data = [];

    // For daily: fetch hourly power curve from first inverter
    if (timeframe === 'day') {
      const inv = inverters[0];
      // CESC has endpoints like /v1/devices/{id}/realtime-day?date=YYYY-MM-DD
      const detailRes = await cescGet(token, `/v1/devices/${inv.id}/realtime-day?date=${date}`, app_key, app_secret);
      const points = detailRes?.data?.data_list || detailRes?.data?.point_list || [];
      
      // Parse point list format from CESC API
      points.forEach(p => {
        const timeStr = p.time || p.point_time || '';
        if (timeStr && p.power) {
          const power = parseFloat(p.power) || 0;
          data.push({
            time: timeStr,
            value: power / 1000 // Convert W to kW
          });
        }
      });
    }

    // For monthly: fetch daily energy for the month
    if (timeframe === 'month') {
      const inv = inverters[0];
      // CESC endpoint for monthly: /v1/devices/{id}/energy-month?month=YYYY-MM
      const monthRes = await cescGet(token, `/v1/devices/${inv.id}/energy-month?month=${date}`, app_key, app_secret);
      const dailyList = monthRes?.data?.data_list || monthRes?.data?.list || [];
      
      // Parse daily list (expecting items with {date, energy} or {date_id, energy})
      dailyList.forEach(item => {
        const dateKey = item.date || item.date_id || '';
        const energy = parseFloat(item.energy) || 0;
        if (dateKey && energy) {
          data.push({
            date_id: dateKey,
            energy: energy
          });
        }
      });
    }

    // For yearly: fetch monthly energy
    if (timeframe === 'year') {
      const inv = inverters[0];
      // CESC endpoint for yearly: /v1/devices/{id}/energy-year?year=YYYY
      const yearRes = await cescGet(token, `/v1/devices/${inv.id}/energy-year?year=${date}`, app_key, app_secret);
      const monthlyList = yearRes?.data?.data_list || yearRes?.data?.list || [];
      
      // Parse monthly list (expecting items with {month, energy} or {date_id, energy})
      monthlyList.forEach(item => {
        const monthKey = item.month || (item.date_id ? String(item.date_id).slice(-2) : '');
        const energy = parseFloat(item.energy) || 0;
        if (monthKey && energy) {
          data.push({
            date_id: `${date}-${String(monthKey).padStart(2, '0')}`,
            energy: energy
          });
        }
      });
    }

    return Response.json({ success: true, data });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});