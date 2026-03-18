import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

const GATEWAY = 'https://gateway.isolarcloud.eu';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

async function sungrowLogin(config) {
  const baseUrl = (config.base_url || GATEWAY).replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/openapi/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
  });
  const data = await res.json();
  if (!data?.result_data?.token) throw new Error(`Login failed`);
  return { token: data.result_data.token, user_id: data.result_data.user_id, base_url: baseUrl };
}

async function sgPost(base_url, path, config, token, user_id, body = {}) {
  const res = await fetch(`${base_url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, token, user_id, req_serial_num: Date.now().toString(), ...body })
  });
  try { return await res.json(); } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const connections = await db.entities.ApiConnection.filter({ provider: 'sungrow' });
    if (!connections.length) return Response.json({ error: 'No connections' });

    const conn = connections[0];
    const { token, user_id, base_url } = await sungrowLogin(conn.config);

    const POINT_IDS = [13003, 13119, 13150, 13028, 13029, 13030, 13031];

    // Try a few variations for a known SN
    const psId = '5293468';
    const devSn = 'A2342308862';
    const psKey = '5293468_1_2_1';

    const results = {};

    results.query_array = await sgPost(base_url, '/openapi/queryDeviceRealTimeData', conn.config, token, user_id, {
      ps_id: psId, device_sn: devSn, point_id_list: POINT_IDS
    });

    results.query_str = await sgPost(base_url, '/openapi/queryDeviceRealTimeData', conn.config, token, user_id, {
      ps_id: psId, device_sn: devSn, point_id_list: POINT_IDS.join(',')
    });

    results.get_array = await sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, {
      ps_key_list: [psKey], point_id_list: POINT_IDS
    });

    results.get_str = await sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, {
      ps_key_list: [psKey], point_id_list: POINT_IDS.join(',')
    });
    
    results.get_devid = await sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, {
      device_id: devSn, point_id_list: POINT_IDS.join(',')
    });

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message });
  }
});