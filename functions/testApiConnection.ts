import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac, createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { connection_id, provider: directProvider } = body;
    const db = base44.asServiceRole;

    // Special case: test system Solis keys (no DB record needed)
    if (directProvider === 'solis_system') {
      const result = await testSolis({});
      return Response.json({ success: result.success, message: result.message });
    }

    const connections = await db.entities.ApiConnection.filter({ id: connection_id });
    const conn = connections[0];
    if (!conn) return Response.json({ error: 'Connection not found' }, { status: 404 });

    let testResult = { success: false, message: '' };

    if (conn.provider === 'sungrow') {
      testResult = await testSungrow(conn.config);
    } else if (conn.provider === 'solis') {
      testResult = await testSolis(conn.config);
    } else {
      testResult = { success: false, message: 'ספק זה עדיין לא נתמך לבדיקה אוטומטית' };
    }

    await db.entities.ApiConnection.update(conn.id, {
      status: testResult.success ? 'connected' : 'error',
      last_tested: new Date().toISOString(),
      error_message: testResult.success ? null : testResult.message
    });

    return Response.json({ success: testResult.success, message: testResult.message });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function trySungrowLogin(baseUrl, config) {
  const url = baseUrl.replace(/\/$/, '');
  const res = await fetch(`${url}/openapi/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-key': config.app_key,
      'sys_code': '901',
      'lang': '_en_US'
    },
    body: JSON.stringify({
      appkey: config.app_key,
      user_account: config.user_account,
      user_password: md5(config.user_password),
      login_type: '0'
    })
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { return { success: false, message: null, html: true }; }
  return { success: data?.result_code === '1' || !!data?.result_data?.token, message: data?.result_msg || data?.msg || null, data };
}

async function testSungrow(config) {
  if (!config?.app_key || !config?.app_secret || !config?.user_account || !config?.user_password) {
    return { success: false, message: 'חסרים פרטי חיבור: App Key, App Secret, User Account, User Password' };
  }

  // If user provided a base_url, use it directly
  if (config.base_url && config.base_url.trim()) {
    const baseUrl = config.base_url.trim().replace(/\/$/, '');
    if (baseUrl.includes('web3.') || (!baseUrl.includes('gateway') && baseUrl.includes('isolarcloud'))) {
      return { success: false, message: `ה-Base URL "${baseUrl}" הוא פורטל Web ולא API Gateway. השתמש ב:\n• אירופה: https://gateway.isolarcloud.eu\n• אסיה/גלובלי: https://gateway.isolarcloud.com.hk` };
    }
    try {
      const result = await trySungrowLogin(baseUrl, config);
      if (result.html) return { success: false, message: `השרת ב-${baseUrl} החזיר HTML ולא JSON — ה-Base URL שגוי.` };
      if (result.success) return { success: true, message: `חיבור לSunGrow הצליח דרך ${baseUrl}!` };
      return { success: false, message: `SunGrow (${baseUrl}): ${result.message || JSON.stringify(result.data)}` };
    } catch (e) {
      return { success: false, message: `שגיאת רשת (${baseUrl}): ${e.message}` };
    }
  }

  // No base_url set — auto-detect by trying EU first, then HK
  const endpoints = [
    'https://gateway.isolarcloud.eu',
    'https://gateway.isolarcloud.com.hk'
  ];

  for (const endpoint of endpoints) {
    try {
      const result = await trySungrowLogin(endpoint, config);
      if (result.html) continue;
      if (result.success) {
        return { success: true, message: `חיבור הצליח דרך ${endpoint}! מומלץ להגדיר Base URL = ${endpoint} בחיבור.` };
      }
      // Got a real API error (not network/HTML) — this is the right endpoint, credentials wrong
      if (result.data?.result_code && result.data.result_code !== '1') {
        return { success: false, message: `SunGrow (${endpoint}): ${result.message || result.data?.result_code} — בדוק שה-App Key, App Secret וסיסמה נכונים.` };
      }
    } catch (e) {
      continue;
    }
  }

  return { success: false, message: 'לא הצלחתי להתחבר לאף endpoint של SunGrow. בדוק את פרטי החיבור או הגדר Base URL ידנית.' };
}

async function testSolis(config) {
  const apiKeyId = config?.key_id || Deno.env.get('SOLIS_API_KEY_ID');
  const apiKeySecret = config?.key_secret || Deno.env.get('SOLIS_API_KEY_SECRET');
  const apiUrl = (config?.api_url || Deno.env.get('SOLIS_API_URL') || 'https://www.soliscloud.com:13333').replace(/\/$/, '');

  if (!apiKeyId || !apiKeySecret) {
    return { success: false, message: 'חסרים מפתחות Solis API' };
  }

  try {
    const body = JSON.stringify({ pageNo: 1, pageSize: 10 });
    const contentMd5 = computeMd5Base64(body);
    const date = new Date().toUTCString().replace('UTC', 'GMT');
    const path = '/v1/api/userStationList';
    const stringToSign = `POST\n${contentMd5}\napplication/json\n${date}\n${path}`;
    const hmac = computeHmacSha1(apiKeySecret, stringToSign);
    const auth = `API ${apiKeyId}:${hmac}`;

    const res = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-MD5': contentMd5,
        'Date': date,
        'Authorization': auth
      },
      body
    });

    const text = await res.text();
    console.log(`[testSolis] status=${res.status} body=${text.substring(0, 300)}`);
    if (!res.ok) {
      return { success: false, message: `HTTP ${res.status}: ${text.substring(0, 200)}` };
    }
    let data;
    try { data = JSON.parse(text); } catch(e) { return { success: false, message: `תגובה לא תקינה: ${text.substring(0, 200)}` }; }
    if (data?.code === '0') {
      return { success: true, message: `חיבור Solis הצליח! נמצאו ${data?.data?.page?.total || 0} תחנות.` };
    } else {
      return { success: false, message: `שגיאת Solis: ${data?.msg || JSON.stringify(data)}` };
    }
  } catch (e) {
    return { success: false, message: `שגיאת רשת: ${e.message}` };
  }
}

function computeMd5Base64(content) {
  return createHash('md5').update(content, 'utf8').digest('base64');
}

function computeHmacSha1(secret, message) {
  return createHmac('sha1', secret).update(message, 'utf8').digest('base64');
}