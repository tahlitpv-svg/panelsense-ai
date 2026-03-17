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

    const results = [];

    // Attempt 1: form params sorted in path for signature, actual body unsorted
    {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const formParams = { username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: 'csp-web' };
      const sortedKeys = Object.keys(formParams).sort();
      const sortedQuery = sortedKeys.map(k => `${k}=${encodeURIComponent(formParams[k])}`).join('&');
      const pathForSign = `/v1/oauth/token?${sortedQuery}`;
      const headersLine = `x-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}`;
      const stringToSign = ['POST','*/*','','application/x-www-form-urlencoded','',headersLine,pathForSign].join('\n');
      const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');
      const body = new URLSearchParams(formParams).toString();
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
      results.push({ attempt: '1_sorted_encoded_query_in_path', status: res.status, body: text.substring(0,500), xError: rh['x-ca-error-message'], stringToSign });
    }

    // Attempt 2: no query params in path (body-only for POST)
    {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const pathForSign = `/v1/oauth/token`;
      const headersLine = `x-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}`;
      const stringToSign = ['POST','*/*','','application/x-www-form-urlencoded','',headersLine,pathForSign].join('\n');
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
      results.push({ attempt: '2_path_only_no_query', status: res.status, body: text.substring(0,500), xError: rh['x-ca-error-message'], stringToSign });
    }

    // Attempt 3: # separator instead of \n
    {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const formParams = { client_id: 'csp-web', grant_type: 'password', password: PASSWORD, username: USERNAME };
      const sortedQuery = Object.keys(formParams).sort().map(k => `${k}=${encodeURIComponent(formParams[k])}`).join('&');
      const pathForSign = `/v1/oauth/token?${sortedQuery}`;
      const stringToSign = ['POST','*/*','','application/x-www-form-urlencoded','',
        `x-ca-key:${APP_KEY}`,`x-ca-nonce:${nonce}`,`x-ca-timestamp:${timestamp}`,
        pathForSign
      ].join('#');
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
      results.push({ attempt: '3_hash_separator', status: res.status, body: text.substring(0,500), xError: rh['x-ca-error-message'], stringToSign });
    }

    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});