import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    var base44 = createClientFromRequest(req);

    var username = Deno.env.get('FUSIONSOLAR_USERNAME');
    var password = Deno.env.get('FUSIONSOLAR_PASSWORD');

    if (!username || !password) {
      return Response.json({ error: 'Missing FUSIONSOLAR credentials' }, { status: 400 });
    }

    console.log('[fusion] Attempting login with user: ' + username);

    var loginRes = await fetch('https://eu5.fusionsolar.huawei.com/thirdData/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: username, systemCode: password })
    });

    var loginText = await loginRes.text();
    console.log('[fusion] Login response status: ' + loginRes.status);
    console.log('[fusion] Login response body: ' + loginText.slice(0, 500));

    var loginData = JSON.parse(loginText);
    var token = loginRes.headers.get('xsrf-token') || '';
    console.log('[fusion] xsrf-token: ' + (token ? token.slice(0, 20) + '...' : 'MISSING'));
    console.log('[fusion] success: ' + loginData.success);
    console.log('[fusion] failCode: ' + (loginData.failCode || 'none'));

    if (!loginData.success) {
      return Response.json({
        error: 'Login failed',
        failCode: loginData.failCode,
        message: loginData.message
      }, { status: 401 });
    }

    if (!token) {
      return Response.json({ error: 'Login OK but no token returned' }, { status: 500 });
    }

    // Try to get station list
    var stationsRes = await fetch('https://eu5.fusionsolar.huawei.com/thirdData/getStationList', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xsrf-token': token },
      body: JSON.stringify({})
    });
    var stationsText = await stationsRes.text();
    console.log('[fusion] getStationList status: ' + stationsRes.status);
    console.log('[fusion] getStationList body: ' + stationsText.slice(0, 500));

    var stationsData = JSON.parse(stationsText);

    return Response.json({
      login_success: true,
      token_received: !!token,
      stations: stationsData
    });

  } catch (err) {
    console.error('[fusion] Error: ' + err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});