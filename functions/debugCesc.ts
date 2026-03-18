import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHmac } from 'node:crypto';

const APP_KEY = '253955251';
const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';
const USERNAME = 'm.b.g.shilo@gmail.com';
const PASSWORD = 'Aa123456';

function buildSignedHeaders(method, path, contentType) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const stringToSign = `${method}#*/*##${contentType}##x-ca-key:${APP_KEY}#x-ca-nonce:${nonce}#x-ca-timestamp:${timestamp}#${path}`;
  const signature = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');
  return { timestamp, nonce, signature, stringToSign };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const BASE_URL = 'http://openapi.inteless.com';
    const ENDPOINT = '/v1/oauth/token';
    const CONTENT_TYPE = 'application/x-www-form-urlencoded';
    const bodyParams = { username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: 'csp-web' };
    const sortedQuery = Object.keys(bodyParams).sort().map(k => `${k}=${bodyParams[k]}`).join('&');
    const fullPath = `${ENDPOINT}?${sortedQuery}`;
    const bodyStr = new URLSearchParams(bodyParams).toString();

    const { timestamp, nonce, signature, stringToSign } = buildSignedHeaders('POST', fullPath, CONTENT_TYPE);

    const requestHeaders = {
      'Accept': '*/*',
      'Content-Type': CONTENT_TYPE,
      'X-Ca-Key': APP_KEY,
      'X-Ca-Nonce': nonce,
      'X-Ca-Timestamp': timestamp,
      'X-Ca-Signature': signature,
      'X-Ca-Signature-Headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp',
    };

    const res = await fetch(`${BASE_URL}${ENDPOINT}`, {
      method: 'POST',
      headers: requestHeaders,
      body: bodyStr,
    });

    const responseBody = await res.text();
    const responseHeaders = {};
    for (const [k, v] of res.headers.entries()) responseHeaders[k] = v;

    const report = {
      "=== REQUEST ===": {
        url: `${BASE_URL}${ENDPOINT}`,
        method: "POST",
        headers: requestHeaders,
        body: bodyStr,
        "string_to_sign (before HMAC)": stringToSign,
        app_key: APP_KEY,
        app_secret_used: APP_SECRET,
      },
      "=== RESPONSE ===": {
        status: res.status,
        status_text: res.statusText,
        headers: responseHeaders,
        body: responseBody || "(empty)",
        error_message: res.headers.get('x-ca-error-message') || null,
        server_string_to_sign: res.headers.get('x-ca-error-message')?.includes('StringToSign') 
          ? res.headers.get('x-ca-error-message') 
          : null,
      },
    };

    return Response.json(report);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});