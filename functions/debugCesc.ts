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

    const results = [];

    // Attempt 1: Direct login without any gateway signing (plain OAuth2)
    {
      const body = new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: 'csp-web' }).toString();
      const res = await fetch('http://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body
      });
      const text = await res.text();
      const xErr = res.headers.get('x-ca-error-message');
      results.push({ attempt: 'no_signing', status: res.status, body: text.substring(0, 500), xError: xErr });
    }

    // Attempt 2: Try HTTPS instead of HTTP
    {
      const body = new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: 'csp-web' }).toString();
      const res = await fetch('https://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body
      });
      const text = await res.text();
      const xErr = res.headers.get('x-ca-error-message');
      results.push({ attempt: 'https_no_signing', status: res.status, body: text.substring(0, 500), xError: xErr });
    }

    // Attempt 3: Different secrets found in E-Linter open API docs
    const SECRETS_TO_TRY = [
      'ihbBwNEj6ZNWGhGRT',
      '6ZNWGhGRTihbBwNEj',
      'csp-web',
    ];

    for (const secret of SECRETS_TO_TRY) {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const sortedQuery = `client_id=csp-web&grant_type=password&password=${PASSWORD}&username=${USERNAME}`;
      const path = `/v1/oauth/token?${sortedQuery}`;
      const stringToSign = `POST#*/*##application/x-www-form-urlencoded##x-ca-key:${APP_KEY}#x-ca-nonce:${nonce}#x-ca-timestamp:${timestamp}#${path}`;
      const sig = createHmac('sha256', secret).update(stringToSign, 'utf8').digest('base64');

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
      const xErr = res.headers.get('x-ca-error-message');
      results.push({ attempt: `secret_${secret.substring(0,8)}`, status: res.status, body: text.substring(0, 300), xError: xErr });
    }

    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});