import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Refresh Sungrow OAuth2 access token using the refresh_token
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

    const cfg = conn.config;
    if (!cfg.oauth_refresh_token) {
      return Response.json({ error: 'No refresh token available. Re-authorize via OAuth.' }, { status: 400 });
    }

    const baseUrl = cfg.oauth_base_url || cfg.base_url || 'https://gateway.isolarcloud.eu';

    // Try refreshing the token
    const refreshEndpoints = [
      '/openapi/refreshToken',
      '/openapi/getToken',
      '/openapi/oauth/token',
    ];

    let tokenResult = null;

    for (const endpoint of refreshEndpoints) {
      try {
        const body = {
          appkey: cfg.app_key,
          refresh_token: cfg.oauth_refresh_token,
          grant_type: 'refresh_token'
        };

        console.log(`[refreshOAuth] Trying ${baseUrl}${endpoint}`);

        const res = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-access-key': cfg.app_secret,
            'sys_code': '901',
            'lang': '_en_US'
          },
          body: JSON.stringify(body)
        });

        const text = await res.text();
        console.log(`[refreshOAuth] ${endpoint}: ${text.substring(0, 500)}`);
        
        let data;
        try { data = JSON.parse(text); } catch(e) { continue; }
        
        if (data?.result_data?.access_token || data?.access_token) {
          tokenResult = data?.result_data || data;
          console.log(`[refreshOAuth] SUCCESS from ${endpoint}`);
          break;
        }
      } catch(e) {
        console.log(`[refreshOAuth] ${endpoint} error: ${e.message}`);
      }
    }

    if (!tokenResult) {
      // Mark connection as needing re-auth
      await db.entities.ApiConnection.update(conn.id, {
        error_message: 'OAuth token expired - re-authorization needed',
        status: 'error'
      });
      return Response.json({ success: false, error: 'Failed to refresh token. Re-authorize via OAuth.' });
    }

    // Update stored tokens
    const updatedConfig = {
      ...cfg,
      oauth_access_token: tokenResult.access_token || tokenResult.token || cfg.oauth_access_token,
      oauth_refresh_token: tokenResult.refresh_token || cfg.oauth_refresh_token,
      oauth_user_id: tokenResult.user_id || cfg.oauth_user_id,
      oauth_token_created: new Date().toISOString(),
      oauth_expires_in: tokenResult.expires_in || cfg.oauth_expires_in || 0,
    };

    await db.entities.ApiConnection.update(conn.id, {
      config: updatedConfig,
      status: 'connected',
      error_message: null
    });

    return Response.json({ success: true, message: 'Token refreshed successfully' });

  } catch (error) {
    console.error('[refreshOAuth] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});