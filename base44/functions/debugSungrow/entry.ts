import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

async function sungrowLogin(config) {
  const baseUrl = (config.base_url || 'https://gateway.isolarcloud.eu').replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/openapi/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
  });
  const data = await res.json();
  if (!data?.result_data?.token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
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
    if (!connections.length) return Response.json({ error: 'No Sungrow connection' });
    
    const conn = connections[0];
    const { token, user_id, base_url } = await sungrowLogin(conn.config);
    
    // Get one inverter
    const listRes = await sgPost(base_url, '/openapi/getPowerStationList', conn.config, token, user_id, { curPage: 1, size: 1 });
    const psId = listRes.result_data.pageList[0].ps_id;
    
    const devList = await sgPost(base_url, '/openapi/getDeviceList', conn.config, token, user_id, { ps_id: psId, curPage: 1, size: 10 });
    const dev = devList.result_data.pageList.find(d => d.device_type === 1);
    
    if (!dev) return Response.json({ error: 'No inverter found', devList });
    
    const psKey = dev.ps_key;
    const sn = dev.device_sn;
    
    // Test 1: device_type as string "1"
    const r1 = await sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, {
       ps_key_list: [psKey], device_type: "1", point_id_list: ["13003", "13009", "13028"]
    });
    
    const bigList = Array.from({length: 50}, (_, i) => String(13000 + i));
    const r8 = await sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, {
       sn_list: [sn], device_type: "1", point_id_list: bigList
    });
    
    return Response.json({
       dev,
       r8_big: r8
    });
    
  } catch (e) {
    return Response.json({ error: e.message, stack: e.stack });
  }
});