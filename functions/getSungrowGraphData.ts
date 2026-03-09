import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

async function sungrowLogin(config) {
  const candidates = [];
  if (config.base_url?.trim()) candidates.push(config.base_url.trim().replace(/\/$/, ''));
  candidates.push('https://gateway.isolarcloud.eu', 'https://gateway.isolarcloud.com.hk');
  for (const baseUrl of candidates) {
    try {
      const res = await fetch(`${baseUrl}/openapi/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
        body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
      });
      const data = JSON.parse(await res.text());
      if (data?.result_data?.token) return { token: data.result_data.token, user_id: data.result_data.user_id, base_url: baseUrl };
    } catch(e) {}
  }
  throw new Error('Sungrow login failed');
}

async function sungrowPost(base_url, path, config, token, user_id, body = {}) {
  const fullBody = { appkey: config.app_key, token, user_id, req_serial_num: Date.now().toString(36) + Math.random().toString(36).slice(2), ...body };
  const res = await fetch(`${base_url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify(fullBody)
  });
  try { return JSON.parse(await res.text()); } catch(e) { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { connection_id, ps_id, timeframe, date } = await req.json();

    const connections = await base44.asServiceRole.entities.ApiConnection.filter({ id: connection_id });
    const conn = connections[0];
    if (!conn) return Response.json({ error: 'Connection not found' }, { status: 404 });

    const { token, user_id, base_url } = await sungrowLogin(conn.config);

    let result = null;

    if (timeframe === 'day') {
      // Try multiple endpoint variants for daily power curve
      const endpoints = [
        { path: '/openapi/getPsDay', body: { ps_id, date_id: date } },
        { path: '/openapi/getPowerStationPowerCurve', body: { ps_id, date_id: date } },
        { path: '/openapi/getDayPowerCurve', body: { ps_id, date } },
        { path: '/openapi/getPsKpiDay', body: { ps_id, date_id: date } },
        { path: '/openapi/getStationPowerByHour', body: { ps_id, date } },
      ];
      for (const ep of endpoints) {
        const res = await sungrowPost(base_url, ep.path, conn.config, token, user_id, ep.body);
        const code = res?.result_code;
        const dataKeys = JSON.stringify(Object.keys(res?.result_data || {}));
        console.log(`[getSungrowGraph day] ${ep.path} code=${code} keys=${dataKeys} sample=${JSON.stringify(res?.result_data)?.substring(0,300)}`);
        if (code === '1' || code === 1) {
          result = { endpoint: ep.path, data: res.result_data };
          break;
        }
      }
    } else if (timeframe === 'month') {
      const endpoints = [
        { path: '/openapi/getPsMonth', body: { ps_id, date_id: date } },
        { path: '/openapi/getPsKpiMonth', body: { ps_id, month: date } },
        { path: '/openapi/getMonthPowerGeneration', body: { ps_id, month: date } },
      ];
      for (const ep of endpoints) {
        const res = await sungrowPost(base_url, ep.path, conn.config, token, user_id, ep.body);
        console.log(`[getSungrowGraph month] ${ep.path} code=${res?.result_code} sample=${JSON.stringify(res?.result_data)?.substring(0,300)}`);
        if (res?.result_code === '1' || res?.result_code === 1) {
          result = { endpoint: ep.path, data: res.result_data };
          break;
        }
      }
    } else if (timeframe === 'year') {
      const endpoints = [
        { path: '/openapi/getPsYear', body: { ps_id, date_id: date } },
        { path: '/openapi/getPsKpiYear', body: { ps_id, year: date } },
        { path: '/openapi/getYearPowerGeneration', body: { ps_id, year: date } },
      ];
      for (const ep of endpoints) {
        const res = await sungrowPost(base_url, ep.path, conn.config, token, user_id, ep.body);
        console.log(`[getSungrowGraph year] ${ep.path} code=${res?.result_code} sample=${JSON.stringify(res?.result_data)?.substring(0,300)}`);
        if (res?.result_code === '1' || res?.result_code === 1) {
          result = { endpoint: ep.path, data: res.result_data };
          break;
        }
      }
    }

    return Response.json({ success: true, result });
  } catch(error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});