import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac } from 'node:crypto';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const db = base44.asServiceRole;
    const connections = await db.entities.ApiConnection.filter({ provider: 'cesc' });
    if (!connections.length) return Response.json({ error: 'No cesc connection found' });
    const { app_key, app_secret, user_account, user_password } = connections[0].config || {};
    console.log('[debug] config keys:', { app_key, app_secret: app_secret?.substring(0,5)+'...', user_account, user_password: user_password?.substring(0,3)+'...' });

    const APP_KEY = app_key || '253955251';
    const APP_SECRET = app_secret || 'ihbBwNEj6ZNWGhGRT';
    const USERNAME = user_account || 'tahlitpv@gmail.com';
    const PASSWORD = user_password || 'Aa123456';

    const formParamsSorted = `client_id=csp-web&grant_type=password&password=${PASSWORD}&username=${USERNAME}`;
    const path = `/v1/oauth/token?${formParamsSorted}`;

    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    const stringToSign = [
      'POST',
      '*/*',
      '',
      'application/x-www-form-urlencoded',
      '',
      `x-ca-key:${APP_KEY}`,
      `x-ca-nonce:${nonce}`,
      `x-ca-timestamp:${timestamp}`,
      path
    ].join('#');

    const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');

    const body = new URLSearchParams({
      username: USERNAME,
      password: PASSWORD,
      grant_type: 'password',
      client_id: 'csp-web'
    });

    const headers = {
      'Accept': '*/*',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Ca-Key': APP_KEY,
      'X-Ca-Signature': sig,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
      'X-Ca-Timestamp': timestamp,
      'X-Ca-Nonce': nonce,
    };

    console.log('[debug] stringToSign:', stringToSign);
    console.log('[debug] sig:', sig);

    let res, text, responseHeaders = {};
    res = await fetch('http://openapi.inteless.com/v1/oauth/token', {
      method: 'POST',
      headers,
      body: body.toString(),
    });
    text = await res.text();
    for (const [k, v] of res.headers.entries()) responseHeaders[k] = v;

    return Response.json({ status: res?.status, body: text?.substring(0, 500), responseHeaders, stringToSign, sig });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});