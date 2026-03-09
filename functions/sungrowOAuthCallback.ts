import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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
      return Response.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Exchange code for token
    const tokenResponse = await fetch('https://api.isolarcloud.eu/openapi/apiManage/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-access-key': secretKey
      },
      body: JSON.stringify({
        appkey: 'BED64E9CFA1847D197F7AC924A19EEAC',
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: 'https://delkal-energy-view.base44.app'
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.result_data?.access_token) {
      return Response.json(
        { error: tokenData.result_message || 'Token exchange failed' },
        { status: 400 }
      );
    }

    const accessToken = tokenData.result_data.access_token;
    const authPsList = tokenData.result_data.auth_ps_list || [];

    // Save to user data
    await base44.auth.updateMe({
      sungrow_oauth_token: accessToken,
      sungrow_auth_ps_list: authPsList,
      sungrow_token_received_at: new Date().toISOString()
    });

    return Response.json({
      success: true,
      access_token: accessToken,
      auth_ps_list: authPsList,
      message: 'OAuth token saved successfully'
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});