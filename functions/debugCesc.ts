import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const APP_KEY = '253955251';
    const APP_SECRET = 'ihbBwNEj6ZNWGhGRT';

    const params = new URLSearchParams({
      username:   APP_KEY,
      password:   APP_SECRET,
      grant_type: 'password',
      client_id:  'csp-web'
    });

    // Try 1: http
    const res1 = await fetch('http://openapi.inteless.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const text1 = await res1.text();
    const headers1 = {};
    for (const [k,v] of res1.headers.entries()) headers1[k] = v;

    // Try 2: https
    const res2 = await fetch('https://openapi.inteless.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const text2 = await res2.text();
    const headers2 = {};
    for (const [k,v] of res2.headers.entries()) headers2[k] = v;

    return Response.json({
      http: { status: res1.status, body: text1, headers: headers1 },
      https: { status: res2.status, body: text2, headers: headers2 }
    });

  } catch (e) {
    return Response.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
});