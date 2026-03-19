import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const GATEWAY = 'https://gateway.isolarcloud.eu';
const APPKEY   = 'BED64E9CFA1847D197F7AC924A19EEAC';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { code } = body;
    if (!code) {
      return Response.json({ error: 'Missing authorization code' }, { status: 400 });
    }

    const secretKey = Deno.env.get('SUNGROW_OAUTH_SECRET_KEY');
    if (!secretKey) {
      return Response.json({ error: 'Server configuration error: SUNGROW_OAUTH_SECRET_KEY missing' }, { status: 500 });
    }

    // ── Exchange code for token ──────────────────────────────────────────────
    const tokenResponse = await fetch(`${GATEWAY}/openapi/apiManage/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'x-access-key': secretKey,
        'sys_code': '901',
        'lang': '_en_US'
      },
      body: JSON.stringify({
        appkey: APPKEY,
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://delkal-energy-view.base44.app'
      })
    });

    const tokenData = await tokenResponse.json();

    const accessToken  = tokenData.result_data?.access_token;
    const refreshToken = tokenData.result_data?.refresh_token;
    const expiresIn    = tokenData.result_data?.expires_in || 7200;
    const authPsList   = tokenData.result_data?.auth_ps_list || [];

    if (!accessToken) {
      return Response.json(
        // Avoid returning sensitive token payload back to the client.
        { error: tokenData.result_msg || tokenData.result_message || 'Token exchange failed' },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // ── Save token to ApiConnection (not user profile) ───────────────────────
    // Find existing Sungrow connection or create one
    const db = base44.asServiceRole;
    const existingConns = await db.entities.ApiConnection.filter({ provider: 'sungrow' });

    const connConfig = {
      provider: 'sungrow',
      auth_method: 'oauth2',
      oauth_access_token:  accessToken,
      oauth_refresh_token: refreshToken,
      oauth_expires_at:    expiresAt,
      oauth_base_url:      GATEWAY,
      app_key:             APPKEY,
      app_secret:          secretKey,
      auth_ps_list:        authPsList,
    };

    if (existingConns.length > 0) {
      await db.entities.ApiConnection.update(existingConns[0].id, {
        config: { ...existingConns[0].config, ...connConfig },
        status: 'connected',
        last_sync: new Date().toISOString(),
        error_message: null
      });
      console.log(`[sungrowOAuthCallback] Updated existing ApiConnection ${existingConns[0].id}`);
    } else {
      await db.entities.ApiConnection.create({
        name: 'Sungrow OAuth2',
        provider: 'sungrow',
        config: connConfig,
        status: 'connected',
        last_sync: new Date().toISOString()
      });
      console.log('[sungrowOAuthCallback] Created new ApiConnection');
    }

    return Response.json({
      success: true,
      auth_ps_list: authPsList,
      expires_at: expiresAt,
      message: 'OAuth token saved successfully to ApiConnection'
    });

  } catch (error) {
    console.error('[sungrowOAuthCallback] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
