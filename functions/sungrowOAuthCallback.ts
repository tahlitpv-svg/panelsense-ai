import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

// Sungrow OAuth2.0 - Exchange authorization code for access token
// Based on iSolarCloud Developer Portal OAuth2 flow
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { code, connection_id } = await req.json();
    if (!code) return Response.json({ error: 'Missing authorization code' }, { status: 400 });
    if (!connection_id) return Response.json({ error: 'Missing connection_id' }, { status: 400 });

    const db = base44.asServiceRole;
    const connections = await db.entities.ApiConnection.filter({ id: connection_id });
    const conn = connections[0];
    if (!conn) return Response.json({ error: 'Connection not found' }, { status: 404 });

    const cfg = conn.config;
    if (!cfg.app_key || !cfg.app_secret) {
      return Response.json({ error: 'Missing app_key or app_secret in connection config' }, { status: 400 });
    }

    // Determine base URL
    const candidates = [];
    if (cfg.base_url?.trim()) candidates.push(cfg.base_url.trim().replace(/\/$/, ''));
    candidates.push('https://gateway.isolarcloud.eu', 'https://gateway.isolarcloud.com.hk');

    let tokenResult = null;
    let usedBaseUrl = null;

    for (const baseUrl of candidates) {
      // Try /openapi/getToken endpoint (standard OAuth2 token exchange)
      const tokenEndpoints = [
        '/openapi/getToken',
        '/openapi/token',
        '/openapi/oauth/token',
      ];

      for (const tokenPath of tokenEndpoints) {
        try {
          console.log(`[sungrowOAuth] Trying ${baseUrl}${tokenPath} with code=${code.substring(0,10)}...`);
          
          const body = {
            appkey: cfg.app_key,
            code: code,
            redirect_uri: cfg.redirect_uri || 'https://delkal-energy-view.base44.app',
            grant_type: 'authorization_code'
          };

          const res = await fetch(`${baseUrl}${tokenPath}`, {
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
          console.log(`[sungrowOAuth] ${tokenPath} response: ${text.substring(0, 500)}`);
          
          let data;
          try { data = JSON.parse(text); } catch(e) { continue; }
          
          const resultCode = String(data?.result_code || data?.code || '');
          
          if (resultCode === '1' || data?.result_data?.access_token || data?.access_token) {
            tokenResult = data?.result_data || data;
            usedBaseUrl = baseUrl;
            console.log(`[sungrowOAuth] SUCCESS! Got token from ${baseUrl}${tokenPath}`);
            break;
          } else {
            console.log(`[sungrowOAuth] ${tokenPath} failed: code=${resultCode} msg=${data?.result_msg || data?.msg || ''}`);
          }
        } catch(e) {
          console.log(`[sungrowOAuth] ${tokenPath} error: ${e.message}`);
        }
      }

      if (tokenResult) break;

      // Also try the login-based approach with code as token
      try {
        console.log(`[sungrowOAuth] Trying login with code at ${baseUrl}...`);
        const loginBody = {
          appkey: cfg.app_key,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: cfg.redirect_uri || 'https://delkal-energy-view.base44.app'
        };
        
        const res = await fetch(`${baseUrl}/openapi/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-access-key': cfg.app_secret,
            'sys_code': '901',
            'lang': '_en_US'
          },
          body: JSON.stringify(loginBody)
        });

        const text = await res.text();
        console.log(`[sungrowOAuth] login-with-code response: ${text.substring(0, 500)}`);
        
        let data;
        try { data = JSON.parse(text); } catch(e) { continue; }
        
        if (data?.result_data?.token || data?.result_data?.access_token) {
          tokenResult = data.result_data;
          usedBaseUrl = baseUrl;
          console.log(`[sungrowOAuth] SUCCESS via login-with-code at ${baseUrl}`);
          break;
        }
      } catch(e) {
        console.log(`[sungrowOAuth] login-with-code error: ${e.message}`);
      }
    }

    if (!tokenResult) {
      return Response.json({ 
        success: false, 
        error: 'Failed to exchange authorization code for token at all endpoints' 
      }, { status: 400 });
    }

    // Save OAuth tokens to the connection config
    const updatedConfig = {
      ...cfg,
      oauth_access_token: tokenResult.access_token || tokenResult.token || '',
      oauth_refresh_token: tokenResult.refresh_token || '',
      oauth_user_id: tokenResult.user_id || tokenResult.uid || '',
      oauth_token_created: new Date().toISOString(),
      oauth_expires_in: tokenResult.expires_in || tokenResult.token_expires_in || 0,
      oauth_base_url: usedBaseUrl,
      auth_method: 'oauth2'
    };

    await db.entities.ApiConnection.update(conn.id, {
      config: updatedConfig,
      status: 'connected',
      last_tested: new Date().toISOString(),
      error_message: null
    });

    console.log(`[sungrowOAuth] Saved OAuth tokens for connection ${conn.id}`);

    return Response.json({
      success: true,
      message: 'OAuth2 authorization successful!',
      has_access_token: !!updatedConfig.oauth_access_token,
      has_refresh_token: !!updatedConfig.oauth_refresh_token,
      user_id: updatedConfig.oauth_user_id,
      base_url: usedBaseUrl
    });

  } catch (error) {
    console.error('[sungrowOAuth] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});