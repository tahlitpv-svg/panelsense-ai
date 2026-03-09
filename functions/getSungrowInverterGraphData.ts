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
    // Power=1, Voltage=3, Temperature=4 (based on typical Sungrow API)
    const [powerData, voltageData, tempData] = await Promise.all([
      fetchDeviceData('1'), // Power
      fetchDeviceData('3'), // Voltage (often MPPT1 or total)
      fetchDeviceData('4')  // Temperature (or current, typically 4 is temp/current depending on model, we'll try to map it)
    ]);

    // Map to Solis format: pac, uPv1, iPv1, temperature, etc.
    const mergedMap = {};

    const addData = (dataArray, keyFormat) => {
      (dataArray || []).forEach((item, idx) => {
        const time = item.time || item.collect_time || `0${idx}:00`;
        if (!mergedMap[time]) {
          mergedMap[time] = { timeStr: time, pac: 0, temperature: 0 };
        }
        mergedMap[time][keyFormat] = parseFloat(item.value) || 0;
      });
    };

    // In a real scenario, we'd loop over multiple MPPT point IDs
    // For now, we simulate PV1 based on whatever we got
    addData(powerData, 'pac');
    Object.values(mergedMap).forEach(m => {
      if (m.pac) m.pac = m.pac * 1000; 
    });

    addData(voltageData, 'uPv1');
    
    // Some models return temp on 4, some current. We'll map it to temperature.
    addData(tempData, 'temperature');

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