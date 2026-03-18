import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

async function sungrowLogin(config) {
  const baseUrl = (config.base_url || 'https://gateway.isolarcloud.eu').replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/openapi/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
  });
  const data = await res.json();
  if (!data?.result_data?.token) throw new Error('Login failed: ' + JSON.stringify(data));
  return { token: data.result_data.token, user_id: data.result_data.user_id, base_url: baseUrl };
}

async function sgPost(base_url, path, config, token, user_id, body = {}) {
  const res = await fetch(`${base_url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, token, user_id, req_serial_num: Date.now().toString(36) + Math.random().toString(36).slice(2), ...body })
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return { raw: text }; }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  const PS_ID = '5106390';
  const PS_KEY = '5106390_11_0_0';

  let bodyJson = {};
  try { bodyJson = await req.json(); } catch(e) {}
  const mode = bodyJson.mode || 'codes';

  const connections = await db.entities.ApiConnection.filter({ provider: 'sungrow' });
  if (!connections.length) return Response.json({ error: 'No Sungrow connection found' });

  const conn = connections[0];
  const { token, user_id, base_url } = await sungrowLogin(conn.config);

  if (mode === 'pskey') {
    const SN = 'A2262930454'; // Real inverter SN (SG50CX)
    const INV_PS_KEY = '5106390_1_1_1'; // Inverter ps_key from getDeviceList
    // Common Sungrow inverter point IDs
    const POINTS = [13003, 13119, 13150, 13009, 13010, 13011, 13012, 13013, 13014, 13015, 13016, 13017, 13018, 13019, 13020, 13021, 13022, 13023, 13024, 13025, 13026, 13027, 13028, 13029, 13030, 13031, 13032, 13033, 13034, 13035, 13036, 13037, 13038, 13039, 13040, 13143, 13144, 13145, 13146];
    const [r1, r2, r3, r4, r5] = await Promise.all([
      sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, { ps_key_list: [INV_PS_KEY], device_type: 1, point_id_list: POINTS }),
      sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, { sn_list: [SN], device_type: 1, point_id_list: POINTS }),
      // Try with uuid
      sgPost(base_url, '/openapi/getDeviceRealTimeData', conn.config, token, user_id, { uuid_list: [2232000], device_type: 1, point_id_list: POINTS }),
      // Try queryMutiPointDataList (station level) with inverter ps_key
      sgPost(base_url, '/openapi/queryMutiPointDataList', conn.config, token, user_id, { ps_id: PS_ID, ps_key_list: [INV_PS_KEY], point_id_list: POINTS }),
      // Try getPsDeviceAttrList without E900 workaround
      sgPost(base_url, '/openapi/getPsDeviceAttrList', conn.config, token, user_id, { ps_id: PS_ID, device_type: 1 }),
    ]);
    return Response.json({ invPsKey_result: r1, sn_result: r2, uuid_result: r3, mutiPoint_invKey: r4, psDeviceAttrList: r5 });
  }

  if (mode === 'commdev') {
    // Get communication_dev_detail_list from stationDetail
    const detailRes = await sgPost(base_url, '/openapi/getPowerStationDetail', conn.config, token, user_id, { ps_id: PS_ID });
    const commDevList = detailRes?.result_data?.communication_dev_detail_list || [];
    return Response.json({ result_code: detailRes?.result_code, comm_dev_count: commDevList.length, comm_dev_list: commDevList });
  }

  if (mode === 'getdevicelist_paged') {
    const r = await sgPost(base_url, '/openapi/getDeviceList', conn.config, token, user_id, { ps_id: PS_ID, curPage: 1, size: 20 });
    return Response.json(r);
  }

  if (mode === 'psrealtime') {
    const r = await sgPost(base_url, '/openapi/getPowerStationRealTimeData', conn.config, token, user_id, { ps_id: PS_ID });
    return Response.json(r);
  }

  // Default: show all codes
  const [detail, devList, devListPaged, psRt] = await Promise.all([
    sgPost(base_url, '/openapi/getPowerStationDetail', conn.config, token, user_id, { ps_id: PS_ID }),
    sgPost(base_url, '/openapi/getPsDeviceList', conn.config, token, user_id, { ps_id: PS_ID }),
    sgPost(base_url, '/openapi/getDeviceList', conn.config, token, user_id, { ps_id: PS_ID, curPage: 1, size: 20 }),
    sgPost(base_url, '/openapi/getPowerStationRealTimeData', conn.config, token, user_id, { ps_id: PS_ID }),
  ]);

  return Response.json({
    ps_id: PS_ID,
    ps_key: PS_KEY,
    stationDetail: { code: detail?.result_code, msg: detail?.result_msg, comm_dev_count: detail?.result_data?.communication_dev_detail_list?.length },
    getPsDeviceList: { code: devList?.result_code, msg: devList?.result_msg },
    getDeviceList_paged: { code: devListPaged?.result_code, msg: devListPaged?.result_msg, data_keys: Object.keys(devListPaged?.result_data || {}) },
    getPowerStationRealTimeData: { code: psRt?.result_code, msg: psRt?.result_msg, data_keys: Object.keys(psRt?.result_data || {}) },
    hint: 'try modes: pskey, commdev, getdevicelist_paged, psrealtime'
  });
});