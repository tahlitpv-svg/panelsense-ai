import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { connection_id } = await req.json();
    const db = base44.asServiceRole;

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

    // Update connection status
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

async function testSungrow(config) {
  if (!config?.app_key || !config?.app_secret || !config?.user_account || !config?.user_password) {
    return { success: false, message: 'חסרים פרטי חיבור: app_key, app_secret, user_account, user_password' };
  }

  const baseUrl = config.base_url || 'https://gateway.isolarcloud.com.hk';

  try {
    const res = await fetch(`${baseUrl}/openapi/login`, {
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
        user_password: config.user_password,
        login_type: '0'
      })
    });

    const data = await res.json();
    
    if (data?.result_code === '1' || data?.result_data?.token) {
      return { success: true, message: 'חיבור לـSunGrow iSolarCloud הצליח!' };
    } else {
      return { success: false, message: `שגיאת SunGrow: ${data?.result_msg || data?.msg || JSON.stringify(data)}` };
    }
  } catch (e) {
    return { success: false, message: `שגיאת רשת: ${e.message}` };
  }
}

async function testSolis(config) {
  const apiKeyId = config?.key_id || Deno.env.get('SOLIS_API_KEY_ID');
  const apiKeySecret = config?.key_secret || Deno.env.get('SOLIS_API_KEY_SECRET');
  const apiUrl = config?.api_url || Deno.env.get('SOLIS_API_URL') || 'https://www.soliscloud.com:13333';

  if (!apiKeyId || !apiKeySecret) {
    return { success: false, message: 'חסרים מפתחות Solis API' };
  }

  try {
    const body = JSON.stringify({ pageNo: 1, pageSize: 1 });
    const contentMd5 = await computeMd5Base64(body);
    const date = new Date().toUTCString();
    const path = '/v1/api/stationList';
    const stringToSign = `POST\n${contentMd5}\napplication/json\n${date}\n${path}`;
    const hmac = await computeHmacSha1(apiKeySecret, stringToSign);
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

    if (res.ok) {
      const data = await res.json();
      if (data?.code === '0') {
        return { success: true, message: `חיבור Solis הצליח! נמצאו ${data?.data?.page?.total || 0} תחנות.` };
      } else {
        return { success: false, message: `שגיאת Solis: ${data?.msg || JSON.stringify(data)}` };
      }
    } else {
      return { success: false, message: `HTTP ${res.status}: ${res.statusText}` };
    }
  } catch (e) {
    return { success: false, message: `שגיאת רשת: ${e.message}` };
  }
}

async function computeMd5Base64(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

async function computeHmacSha1(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}