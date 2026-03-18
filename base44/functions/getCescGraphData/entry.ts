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
  try { data = JSON.parse(text); } catch { throw new Error(`Login parse error: ${text.substring(0, 200)}`); }
  const token = data?.data?.access_token || data?.access_token;
  if (!token) throw new Error(`Login failed: ${JSON.stringify(data).substring(0, 200)}`);
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
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { cescPlantId, connectionId, timeframe } = await req.json();
    if (!cescPlantId || !connectionId) {
      return Response.json({ error: 'Missing cescPlantId or connectionId' }, { status: 400 });
    }

    // Get connection config
    const conn = await base44.entities.ApiConnection.filter({ id: connectionId });
    if (!conn.length) return Response.json({ error: 'Connection not found' }, { status: 404 });
    
    const { app_key, app_secret, user_account, user_password } = conn[0].config || {};
    if (!app_key || !app_secret || !user_account || !user_password) {
      return Response.json({ error: 'Missing connection credentials' }, { status: 400 });
    }

    const token = await cescLogin(app_key, app_secret, user_account, user_password);
    
    // Get detailed plant data with inverter info
    const plantData = await cescGet(token, `/v1/plants/${cescPlantId}/overview`, app_key, app_secret);
    
    // Get device list to fetch inverter details
    const deviceList = await cescGet(token, `/v1/plants/${cescPlantId}/devices`, app_key, app_secret);
    const devices = deviceList?.data?.infos || [];
    
    // If day requested, get daily power curve from device
    if (timeframe === 'day') {
      const inverters = devices.filter(d => d.device_type === 1); // 1 = inverter
      if (inverters.length > 0) {
        const inv = inverters[0];
        const today = new Date().toISOString().split('T')[0];
        const curveData = await cescGet(token, `/v1/devices/${inv.id}/power-curve?date=${today}`, app_key, app_secret);
        const points = curveData?.data?.points || [];
        return Response.json({ 
          success: true, 
          data: points.map(p => ({ 
            time: p.time, 
            value: parseFloat(p.power) || 0 
          }))
        });
      }
    }

    // For all timeframes, get inverter details (temps, voltages)
    const inverterDetails = [];
    for (const dev of devices.filter(d => d.device_type === 1)) {
      const details = await cescGet(token, `/v1/devices/${dev.id}/real-time`, app_key, app_secret);
      inverterDetails.push({
        device_id: dev.id,
        name: dev.name,
        ac_power_kw: (parseFloat(details?.data?.pac) || 0) / 1000,
        dc_power_kw: (parseFloat(details?.data?.pdc) || 0) / 1000,
        temps: {
          igbt: parseFloat(details?.data?.temp_igbt) || null,
          ambient: parseFloat(details?.data?.temp_ambient) || null,
        },
        phase_voltages: {
          l1: parseFloat(details?.data?.vol_a) || null,
          l2: parseFloat(details?.data?.vol_b) || null,
          l3: parseFloat(details?.data?.vol_c) || null,
        }
      });
    }

    return Response.json({ 
      success: true, 
      plant: plantData?.data,
      inverters: inverterDetails,
      data: [] 
    });

  } catch (error) {
    console.error('[getCescGraphData]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});