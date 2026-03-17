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

    // Test 1: HTTP plain with all response headers
    {
      const res = await fetch('http://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      const text = await res.text();
      const responseHeaders = {};
      for (const [k, v] of res.headers.entries()) responseHeaders[k] = v;
      results.push({ attempt: 'plain_post', status: res.status, body: text.substring(0, 500), responseHeaders });
    }

    // Test 2: HTTP with different client_id
    {
      const b2 = new URLSearchParams({ username: USERNAME, password: PASSWORD, grant_type: 'password', client_id: APP_KEY });
      const res = await fetch('http://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: b2.toString()
      });
      const text = await res.text();
      results.push({ attempt: 'client_id_as_appkey', status: res.status, body: text.substring(0, 500) });
    }

    // Test 3: HTTPS + Full signature
    {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const signHeaders = `x-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}`;
      const stringToSign = `POST\n\n\napplication/x-www-form-urlencoded\n\n${signHeaders}\n/v1/oauth/token`;
      const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');
      const res = await fetch('https://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        headers: {
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
      results.push({ attempt: 'full_sig_v1_path', status: res.status, body: text.substring(0, 500), stringToSign });
    }

    // Test 4: HTTPS plain no sig
    {
      const res = await fetch('https://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      const text = await res.text();
      results.push({ attempt: 'https_plain', status: res.status, body: text.substring(0, 500) });
    }

    // Test 5: HTTPS with full sig + form params in URL string
    {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const signedHeadersStr = `x-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}`;
      const formParamsSorted = `client_id=csp-web&grant_type=password&password=${PASSWORD}&username=${USERNAME}`;
      const urlForSign = `/v1/oauth/token?${formParamsSorted}`;
      const stringToSign = `POST\n\n\napplication/x-www-form-urlencoded\n\n${signedHeadersStr}\n${urlForSign}`;
      const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');
      const res = await fetch('https://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        headers: {
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
      results.push({ attempt: 'https_sig_form_in_url', status: res.status, body: text.substring(0, 500), stringToSign });
    }

    // Test 6: Alibaba Cloud style - Content-MD5 included even if empty
    {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      // Alibaba Cloud: headers in stringToSign MUST match X-Ca-Signature-Headers exactly, sorted
      // and the format is HeaderKey:HeaderValue\n (last one no \n)
      const signedHeadersStr = `x-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}`;
      // URL = /v1/oauth/token (path only, no form params for POST with x-www-form-urlencoded)
      const stringToSign = `POST\napplication/json\n\napplication/x-www-form-urlencoded\n\n${signedHeadersStr}\n/v1/oauth/token`;
      const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');
      const res = await fetch('https://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
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
      results.push({ attempt: 'alibaba_accept_in_sign', status: res.status, body: text.substring(0, 500), stringToSign });
    }

    // Test 6b: sig with /oauth/token (no v1) in URL string
    {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const signedHeadersStr = `x-ca-key:${APP_KEY}\nx-ca-nonce:${nonce}\nx-ca-timestamp:${timestamp}`;
      const stringToSign = `POST\n\n\napplication/x-www-form-urlencoded\n\n${signedHeadersStr}\n/oauth/token`;
      const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');
      const res = await fetch('https://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        headers: {
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
      results.push({ attempt: 'https_sig_no_v1_in_url', status: res.status, body: text.substring(0, 500), stringToSign });
    }

    // Test 7: sig with X-Ca-Key only in headers (minimal)
    {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const signedHeadersStr = `x-ca-key:${APP_KEY}`;
      const stringToSign = `POST\n\n\napplication/x-www-form-urlencoded\n\n${signedHeadersStr}\n/v1/oauth/token`;
      const sig = createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');
      const res = await fetch('https://openapi.inteless.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Ca-Key': APP_KEY,
          'X-Ca-Signature': sig,
          'X-Ca-Signature-Headers': 'x-ca-key',
          'X-Ca-Timestamp': timestamp,
          'X-Ca-Nonce': nonce,
        },
        body: body.toString()
      });
      const text = await res.text();
      results.push({ attempt: 'https_sig_key_only', status: res.status, body: text.substring(0, 500), stringToSign });
    }

    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});