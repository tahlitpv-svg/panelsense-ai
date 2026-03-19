import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

const GATEWAY = 'https://gateway.isolarcloud.eu';

function md5(str) { return createHash('md5').update(str, 'utf8').digest('hex'); }

async function sungrowLogin(config) {
  const baseUrl = (config.base_url || GATEWAY).replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/openapi/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
  });
  const data = await res.json();
  return { token: data.result_data.token, user_id: data.result_data.user_id, base_url: baseUrl };
}

async function sgPost(base_url, path, config, token, user_id, body = {}) {
  const res = await fetch(`${base_url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, token, user_id, req_serial_num: Date.now().toString(36) + Math.random().toString(36).slice(2), ...body })
  });
  try { return await res.json(); } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const connections = await db.entities.ApiConnection.filter({ provider: 'sungrow' });
    const conn = connections[0];
    const { token, user_id, base_url } = await sungrowLogin(conn.config);

    // Let's test getDevicePointDataList and others
    const psKey = "5905751_1_3_1"; // Inverter2
    const sn = "A2230241301";

    const r1 = await sgPost(base_url, '/openapi/getDevicePointList', conn.config, token, user_id, {
      ps_key: psKey, device_type: "1"
    });

    const r2 = await sgPost(base_url, '/openapi/getDeviceList', conn.config, token, user_id, {
      ps_id: psKey.split('_')[0], curPage: 1, size: 10
    });

    const r3 = await sgPost(base_url, '/openapi/getDevicePointDataList', conn.config, token, user_id, {
      ps_key: psKey, device_type: "1"
    });

    return Response.json({
      r1_getDevicePointList: r1,
      r2_getDeviceRealTimeData_with_str: r2,
      r3_getDevicePointDataList: r3
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});