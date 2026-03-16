import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

async function sungrowLogin(config) {
  if (config.auth_method === 'oauth2' && config.oauth_access_token) {
    const baseUrl = config.oauth_base_url || config.base_url || 'https://gateway.isolarcloud.eu';
    return { token: config.oauth_access_token, user_id: config.oauth_user_id || '', base_url: baseUrl.replace(/\/$/, ''), auth_method: 'oauth2' };
  }
  const baseUrl = (config.base_url || 'https://gateway.isolarcloud.eu').replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/openapi/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
  });
  const data = await res.json();
  if (!data?.result_data?.token) throw new Error('Login failed: ' + JSON.stringify(data));
  return { token: data.result_data.token, user_id: data.result_data.user_id, base_url: baseUrl, auth_method: 'login' };
}

async function sgPost(base_url, path, config, token, user_id, body = {}) {
  const res = await fetch(`${base_url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, token, user_id, req_serial_num: Date.now().toString(36), ...body })
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return { raw: text }; }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const PS_ID = '5106390';

  const connections = await db.entities.ApiConnection.filter({ provider: 'sungrow' });
  if (!connections.length) return Response.json({ error: 'No Sungrow connection found' });

  const conn = connections[0];
  const { token, user_id, base_url, auth_method } = await sungrowLogin(conn.config);

  const results = { ps_id: PS_ID, base_url, auth_method, endpoints: {} };

  // 1. Station list entry for Gafni
  const listRes = await sgPost(base_url, '/openapi/getPowerStationList', conn.config, token, user_id, { curPage: 1, size: 200 });
  const stations = listRes?.result_data?.pageList || listRes?.result_data?.list || [];
  const gafniStation = stations.find(s => String(s.ps_id) === PS_ID);
  results.endpoints.stationListEntry = gafniStation || 'NOT FOUND';

  // 2. Station detail
  const detailRes = await sgPost(base_url, '/openapi/getPowerStationDetail', conn.config, token, user_id, { ps_id: PS_ID });
  results.endpoints.stationDetail = detailRes;

  // 3. getPsDeviceList
  const devListRes = await sgPost(base_url, '/openapi/getPsDeviceList', conn.config, token, user_id, { ps_id: PS_ID });
  results.endpoints.getPsDeviceList = devListRes;

  // 4. getDeviceList
  const devList2Res = await sgPost(base_url, '/openapi/getDeviceList', conn.config, token, user_id, { ps_id: PS_ID });
  results.endpoints.getDeviceList = devList2Res;

  // 5. queryPsProfit
  const profitRes = await sgPost(base_url, '/openapi/queryPsProfit', conn.config, token, user_id, { ps_id: PS_ID });
  results.endpoints.queryPsProfit = profitRes;

  // 6. Try getPsDeviceAttrList
  const attrRes = await sgPost(base_url, '/openapi/getPsDeviceAttrList', conn.config, token, user_id, { ps_id: PS_ID });
  results.endpoints.getPsDeviceAttrList = attrRes;

  // 7. Try queryDeviceInfo
  const devInfoRes = await sgPost(base_url, '/openapi/queryDeviceInfo', conn.config, token, user_id, { ps_id: PS_ID });
  results.endpoints.queryDeviceInfo = devInfoRes;

  // 8. queryDeviceRealTimeData — try ps_id only (no device_sn)
  const rtPsOnly = await sgPost(base_url, '/openapi/queryDeviceRealTimeData', conn.config, token, user_id, {
    ps_id: PS_ID,
    point_id_list: [13003, 13119, 13150, 13009, 13010, 13011, 13028, 13029, 13030, 13031, 13032, 13033, 13034, 13035]
  });
  results.endpoints.queryDeviceRealTimeData_psIdOnly = rtPsOnly;

  // 9. getPsDeviceList with device_type=1 (inverter)
  const invListRes = await sgPost(base_url, '/openapi/getPsDeviceList', conn.config, token, user_id, { ps_id: PS_ID, device_type: 1 });
  results.endpoints.getPsDeviceList_type1 = invListRes;

  // 10. getDeviceRealTimeData (older endpoint)
  const oldRtRes = await sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, { ps_id: PS_ID });
  results.endpoints.getDeviceRealTimeData = oldRtRes;

  // 11. queryMutiPointDataList — a common Sungrow endpoint for bulk point data
  const multiPointRes = await sgPost(base_url, '/openapi/queryMutiPointDataList', conn.config, token, user_id, {
    ps_id: PS_ID,
    point_id_list: [13003, 13119, 13150, 13009, 13010, 13011, 13028, 13029, 13030, 13031]
  });
  results.endpoints.queryMutiPointDataList = multiPointRes;

  // 12. getPowerStationRealTimeData
  const psRtRes = await sgPost(base_url, '/openapi/getPowerStationRealTimeData', conn.config, token, user_id, { ps_id: PS_ID });
  results.endpoints.getPowerStationRealTimeData = psRtRes;

  return Response.json(results, { headers: { 'Content-Type': 'application/json' } });
});