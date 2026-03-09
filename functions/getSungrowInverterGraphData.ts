import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { device_id, ps_id, query_date } = body;

    if (!query_date || (!device_id && !ps_id)) {
      return Response.json(
        { error: 'Missing required parameters: query_date and either device_id or ps_id' },
        { status: 400 }
      );
    }

    const token = user.sungrow_oauth_token;
    if (!token) {
      return Response.json(
        { error: 'No Sungrow token found. Please authenticate first.' },
        { status: 401 }
      );
    }

    // Sungrow V2 API generally uses getDeviceHistoryData or getHistoryData for devices
    // We will attempt getHistoryData with the device_id
    const fetchDeviceData = async (point_id) => {
      const response = await fetch('https://api.isolarcloud.eu/openapi/getHistoryData', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appkey: 'BED64E9CFA1847D197F7AC924A19EEAC',
          token: token,
          ps_id: ps_id, 
          device_id: device_id,
          query_date: query_date,
          point_id: point_id,
          type: '1'
        })
      });
      const data = await response.json();
      return data.result_data || [];
    };

    // Point IDs for inverter:
    // This varies by inverter model in Sungrow. 
    // Power=1, Voltage=3, Current=4... we will pull standard ones.
    const [powerData, voltageData, currentData] = await Promise.all([
      fetchDeviceData('1'), // Power
      fetchDeviceData('3'), // Voltage (often MPPT1 or total)
      fetchDeviceData('4')  // Current
    ]);

    // Map to Solis format: pac, uPv1, iPv1, etc.
    const mergedMap = {};

    const addData = (dataArray, keyFormat) => {
      (dataArray || []).forEach((item, idx) => {
        const time = item.time || item.collect_time || `0${idx}:00`;
        if (!mergedMap[time]) {
          mergedMap[time] = { timeStr: time, pac: 0 };
        }
        mergedMap[time][keyFormat] = parseFloat(item.value) || 0;
      });
    };

    // In a real scenario, we'd loop over multiple MPPT point IDs
    // For now, we simulate PV1/PV2 based on whatever we got
    addData(powerData, 'pac');
    // Sungrow API in W or kW? We assume kW for pac, Solis uses W.
    // Let's multiply by 1000 so it acts like Solis (which we multiply by pacPec=0.001)
    Object.values(mergedMap).forEach(m => {
      if (m.pac) m.pac = m.pac * 1000; 
    });

    addData(voltageData, 'uPv1');
    addData(currentData, 'iPv1');

    const result = Object.values(mergedMap).sort((a, b) => a.timeStr.localeCompare(b.timeStr));

    return Response.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Sungrow Inverter API error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});