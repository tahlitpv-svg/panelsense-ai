import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac } from 'node:crypto';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const APP_KEY = '253955251';
    const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
    const USERNAME = 'tahlitpv@gmail.com';
    const PASSWORD = 'Aa123456';

    const body = new URLSearchParams({
      username: USERNAME,
      password: PASSWORD,
      grant_type: 'password',
      client_id: 'csp-web'
    });

    const results = [];

    // Test with # separator format (discovered from server error)
    {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const formParamsSorted = `client_id=csp-web&grant_type=password&password=${PASSWORD}&username=${USERNAME}`;
      const pathForSign = `/v1/oauth/token?${formParamsSorted}`;
      const stringToSign = [
        'POST', '*/*', '', 'application/x-www-form-urlencoded', '',
        `x-ca-key:${APP_KEY}`, `x-ca-nonce:${nonce}`, `x-ca-timestamp:${timestamp}`,
        pathForSign
      ].join('#');
      const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');
      const res = await fetch('http://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Accept': '*/*',
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Ca-Key': APP_KEY,
          'X-Ca-Signature': sig,
          'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
          'X-Ca-Timestamp': timestamp,
          'X-Ca-Nonce': nonce,
        },
        body: body.toString()
      });
      const text = await res.text();
      const rh = {};
      for (const [k, v] of res.headers.entries()) rh[k] = v;
      results.push({ attempt: 'hash_format_v1_in_path', status: res.status, body: text.substring(0, 500), responseHeaders: rh, stringToSign: stringToSign.substring(0, 200) });
    }

    // Test same but without redirect:follow (manual)
    {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const formParamsSorted = `client_id=csp-web&grant_type=password&password=${PASSWORD}&username=${USERNAME}`;
      const pathForSign = `/v1/oauth/token?${formParamsSorted}`;
      const stringToSign = [
        'POST', '*/*', '', 'application/x-www-form-urlencoded', '',
        `x-ca-key:${APP_KEY}`, `x-ca-nonce:${nonce}`, `x-ca-timestamp:${timestamp}`,
        pathForSign
      ].join('#');
      const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');
      const res = await fetch('http://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Accept': '*/*',
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Ca-Key': APP_KEY,
          'X-Ca-Signature': sig,
          'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
          'X-Ca-Timestamp': timestamp,
          'X-Ca-Nonce': nonce,
        },
        body: body.toString()
      });
      const text = await res.text();
      const rh = {};
      for (const [k, v] of res.headers.entries()) rh[k] = v;
      results.push({ attempt: 'hash_format_manual_redirect', status: res.status, body: text.substring(0, 500), responseHeaders: rh });
    }

    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});