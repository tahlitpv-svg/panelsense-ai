import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
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
      } else if (conn.provider === 'cesc') {
        sites = await fetchCescSites(conn.config);
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

async function fetchCescSites(config) {
  const { app_key, app_secret, user_account, user_password } = config || {};
  if (!app_key || !app_secret || !user_account || !user_password) {
    throw new Error('חסרים פרטי חיבור CESC');
  }

  // Login
  const body = JSON.stringify({ username: user_account, password: user_password, grant_type: 'password', client_id: 'openapi' });
  const md5b64 = createHash('md5').update(body).digest('base64');
  const nonce = crypto.randomUUID();
  const path = '/oauth/token';
  const textToSign = `POST\napplication/json\n${md5b64}\napplication/json\n\nx-ca-key:${app_key}\nx-ca-nonce:${nonce}\n${path}`;
  const signature = createHmac('sha256', app_secret).update(textToSign).digest('base64');

  const loginRes = await fetch(`https://pv.inteless.com${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'Accept': 'application/json',
      'Content-MD5': md5b64, 'X-Ca-Key': app_key, 'X-Ca-Nonce': nonce,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce', 'X-Ca-Signature': signature
    },
    body
  });
  const loginData = await loginRes.json();
  const token = loginData?.data?.access_token || loginData?.access_token;
  if (!token) throw new Error(`CESC login failed: ${JSON.stringify(loginData).substring(0, 200)}`);

  // Fetch all plants
  const allSites = [];
  let page = 1;
  while (true) {
    const emptyMd5 = createHash('md5').update('').digest('base64');
    const n = crypto.randomUUID();
    const ts = Date.now().toString();
    const plantsPath = `/v1/plants?page=${page}&limit=50`;
    const sign2 = createHmac('sha256', app_secret).update(
      `GET\napplication/json\n${emptyMd5}\napplication/json\n\nx-ca-key:${app_key}\nx-ca-nonce:${n}\nx-ca-timestamp:${ts}\n${plantsPath}`
    ).digest('base64');

    const res = await fetch(`https://pv.inteless.com/api${plantsPath}`, {
      headers: {
        'Accept': 'application/json', 'Content-Type': 'application/json', 'Content-MD5': emptyMd5,
        'X-Ca-Key': app_key, 'X-Ca-Nonce': n, 'X-Ca-Timestamp': ts,
        'X-Ca-Signature': sign2, 'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();
    const infos = data?.data?.infos || [];
    for (const p of infos) {
      allSites.push({
        external_id: String(p.id),
        name: p.name,
        capacity_kwp: null,
        address: p.address || null,
        latitude: null,
        longitude: null,
        provider: 'cesc',
        cesc_plant_id: String(p.id)
      });
    }
    if (infos.length < 50) break;
    page++;
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
  let loginResult = null;

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
        loginResult = loginData;
        workingBase = baseUrl;
        break;
      }
    } catch(e) {
      console.log(`[fetchSungrow login error] base=${candidates} e=${e.message}`);
    }
  }

  if (!token) throw new Error('לא הצלחתי להתחבר לשרת Sungrow - בדוק פרטי חיבור');

  // get user_id and org_id from login
  const userId = loginResult?.result_data?.user_id;
  const orgId = loginResult?.result_data?.user_master_org_id;

  const headers = {
    'Content-Type': 'application/json',
    'x-access-key': config.app_secret,
    'token': token,
    'sys_code': '901',
    'lang': '_en_US'
  };

  const serialNum = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
  const baseBody = { appkey: config.app_key, token, req_serial_num: serialNum(), ...(userId ? { user_id: userId } : {}), ...(orgId ? { org_id: orgId } : {}) };

  // Try multiple known endpoint variants - main one from docs is getPowerStationList
  const endpoints = [
    { path: '/openapi/getPowerStationList', body: { ...baseBody, curPage: 1, size: 100 } },
    { path: '/openapi/getPsList', body: { ...baseBody, curPage: 1, size: 100 } },
    { path: '/openapi/getPlantList', body: { ...baseBody, curPage: 1, size: 100 } },
    { path: '/openapi/getStationList', body: { ...baseBody, curPage: 1, size: 100 } },
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
      console.log(`[fetchSungrow] SUCCESS path=${ep.path} plants_count=${plants.length} sample=${JSON.stringify(plants[0] || {})}`);
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