import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}
function computeMd5Base64(content) {
  return createHash('md5').update(content, 'utf8').digest('base64');
}
function computeHmacSha1(secret, message) {
  return createHmac('sha1', secret).update(message, 'utf8').digest('base64');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { connection_id, provider: directProvider } = await req.json();
    const db = base44.asServiceRole;

    let sites = [];

    if (directProvider === 'solis_system') {
      sites = await fetchSolisSites({});
    } else {
      const connections = await db.entities.ApiConnection.filter({ id: connection_id });
      const conn = connections[0];
      if (!conn) return Response.json({ error: 'Connection not found' }, { status: 404 });

      if (conn.provider === 'solis') {
        sites = await fetchSolisSites(conn.config);
      } else if (conn.provider === 'sungrow') {
        sites = await fetchSungrowSites(conn.config);
      } else {
        return Response.json({ error: 'ספק זה עדיין לא נתמך לייבוא' }, { status: 400 });
      }
    }

    return Response.json({ success: true, sites });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function fetchSolisSites(config) {
  const apiKeyId = config?.key_id || Deno.env.get('SOLIS_API_KEY_ID');
  const apiKeySecret = config?.key_secret || Deno.env.get('SOLIS_API_KEY_SECRET');
  const apiUrl = (config?.api_url || Deno.env.get('SOLIS_API_URL') || 'https://www.soliscloud.com:13333').replace(/\/$/, '');

  const allSites = [];
  let pageNo = 1;

  while (true) {
    const body = JSON.stringify({ pageNo, pageSize: 100 });
    const contentMd5 = computeMd5Base64(body);
    const date = new Date().toUTCString().replace('UTC', 'GMT');
    const path = '/v1/api/userStationList';
    const stringToSign = `POST\n${contentMd5}\napplication/json\n${date}\n${path}`;
    const hmac = computeHmacSha1(apiKeySecret, stringToSign);
    const auth = `API ${apiKeyId}:${hmac}`;

    const res = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-MD5': contentMd5, 'Date': date, 'Authorization': auth },
      body
    });
    const data = await res.json();
    if (data?.code !== '0') break;

    const records = data?.data?.page?.records || [];
    const total = data?.data?.page?.total || 0;

    for (const r of records) {
      allSites.push({
        external_id: String(r.id),
        name: r.stationName || r.name,
        capacity_kwp: r.capacity ? parseFloat(r.capacity) : null,
        address: r.installationAddress || r.address || null,
        latitude: r.latitude ? parseFloat(r.latitude) : null,
        longitude: r.longitude ? parseFloat(r.longitude) : null,
        provider: 'solis',
        solis_station_id: String(r.id),
        solis_sno: r.sno || null
      });
    }

    if (allSites.length >= total) break;
    pageNo++;
  }

  return allSites;
}

async function fetchSungrowSites(config) {
  // Try configured base_url, then EU, then HK
  const candidates = [];
  if (config.base_url && config.base_url.trim()) {
    candidates.push(config.base_url.trim().replace(/\/$/, ''));
  }
  candidates.push('https://gateway.isolarcloud.eu', 'https://gateway.isolarcloud.com.hk');

  let token = null;
  let workingBase = null;

  for (const baseUrl of candidates) {
    try {
      const loginRes = await fetch(`${baseUrl}/openapi/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
        body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
      });
      const text = await loginRes.text();
      let loginData;
      try { loginData = JSON.parse(text); } catch(e) { continue; }
      console.log(`[fetchSungrow login] base=${baseUrl} code=${loginData?.result_code} token=${loginData?.result_data?.token ? 'yes' : 'no'}`);
      if (loginData?.result_data?.token) {
        token = loginData.result_data.token;
        workingBase = baseUrl;
        break;
      }
    } catch(e) {
      console.log(`[fetchSungrow login error] base=${candidates} e=${e.message}`);
    }
  }

  if (!token) throw new Error('לא הצלחתי להתחבר לשרת Sungrow - בדוק פרטי חיבור');

  const headers = {
    'Content-Type': 'application/json',
    'x-access-key': config.app_secret,
    'token': token,
    'sys_code': '901',
    'lang': '_en_US'
  };

  // Try multiple known endpoint variants
  const endpoints = [
    { path: '/openapi/getPsList', body: { appkey: config.app_key, curPage: 1, size: 100 } },
    { path: '/openapi/getPlantList', body: { appkey: config.app_key, curPage: 1, size: 100 } },
    { path: '/openapi/getPlantList', body: { appkey: config.app_key, curPage: '1', size: '100' } },
  ];

  let plants = [];
  for (const ep of endpoints) {
    const res = await fetch(`${workingBase}${ep.path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(ep.body)
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { continue; }
    console.log(`[fetchSungrow list] path=${ep.path} code=${data?.result_code} data_keys=${JSON.stringify(Object.keys(data?.result_data || {}))} full=${text.substring(0, 500)}`);

    if (data?.result_code === '1' || data?.result_code === 1) {
      plants = data?.result_data?.pageList || data?.result_data?.list || data?.result_data?.plants || [];
      console.log(`[fetchSungrow] SUCCESS path=${ep.path} plants_count=${plants.length}`);
      break;
    }
  }

  return plants.map(p => ({
    external_id: String(p.ps_id || p.plant_id || p.id),
    name: p.ps_name || p.plant_name || p.name,
    capacity_kwp: p.design_capacity ? parseFloat(p.design_capacity) : null,
    address: p.ps_location || p.address || null,
    latitude: p.latitude ? parseFloat(p.latitude) : null,
    longitude: p.longitude ? parseFloat(p.longitude) : null,
    provider: 'sungrow',
    sungrow_station_id: String(p.ps_id || p.plant_id || p.id)
  }));
}