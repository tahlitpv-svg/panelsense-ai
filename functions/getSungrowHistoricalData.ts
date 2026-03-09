import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { ps_id, query_date, point_id } = body;

    if (!ps_id || !query_date || point_id === undefined) {
      return Response.json(
        { error: 'Missing required parameters: ps_id, query_date, point_id' },
        { status: 400 }
      );
    }

    // Get token from user data
    const token = user.sungrow_oauth_token;
    if (!token) {
      return Response.json(
        { error: 'No Sungrow token found. Please authenticate first.' },
        { status: 401 }
      );
    }

    // Call Sungrow API
    const response = await fetch('https://api.isolarcloud.eu/openapi/getHistoryData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appkey: 'BED64E9CFA1847D197F7AC924A19EEAC',
        token: token,
        ps_id: ps_id,
        query_date: query_date,
        point_id: point_id,
        type: '1'
      })
    });

    const data = await response.json();

    if (!response.ok || data.code !== '0') {
      return Response.json(
        { error: data.msg || 'Failed to fetch Sungrow data' },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      data: data.result_data || []
    });
  } catch (error) {
    console.error('Sungrow API error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});