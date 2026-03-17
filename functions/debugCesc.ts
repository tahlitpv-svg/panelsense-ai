import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac } from 'node:crypto';

const APP_KEY = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME = 'tahlitpv@gmail.com';
const PASSWORD = 'Aa123456';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    // Build EXACTLY what the server shows as its expected StringToSign
    // Server: POST#*/*##application/x-www-form-urlencoded##x-ca-key:...#x-ca-nonce:...#x-ca-timestamp:...#/v1/oauth/token?client_id=csp-web&grant_type=password&password=Aa123456&username=tahlitpv@gmail.com
    const sortedQuery = `client_id=csp-web&grant_type=password&password=${PASSWORD}&username=${USERNAME}`;
    const path = `/v1/oauth/token?${sortedQuery}`;

    const stringToSign = `POST#*/*##application/x-www-form-urlencoded##x-ca-key:${APP_KEY}#x-ca-nonce:${nonce}#x-ca-timestamp:${timestamp}#${path}`;
    const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');

    const body = new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: 'csp-web' }).toString();

    const res = await fetch('http://openapi.inteless.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Ca-Key': APP_KEY,
        'X-Ca-Nonce': nonce,
        'X-Ca-Timestamp': timestamp,
        'X-Ca-Signature': sig,
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
      },
      body
    });

    const text = await res.text();
    const rh = {};
    for (const [k,v] of res.headers.entries()) rh[k] = v;

    return Response.json({
      status: res.status,
      body: text.substring(0, 1000),
      xError: rh['x-ca-error-message'],
      stringToSign,
      sig
    });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});