import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

// Login via OpenAPI (sys_code 901)
async function sungrowOpenApiLogin(config, baseUrl) {
  const res = await fetch(`${baseUrl}/openapi/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
    body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
  });
  const data = JSON.parse(await res.text());
  if (data?.result_data?.token) return { token: data.result_data.token, user_id: data.result_data.user_id };
  return null;
}

// Login via Web Portal API (sys_code 900) — gives access to graph endpoints
async function sungrowWebLogin(config, baseUrl) {
  // Try multiple login paths used by iSolarCloud web portal
  const paths = [
    '/v1/userService/login',
    '/v1/gatewayService/login',
    '/openapi/login',
  ];
  for (const path of paths) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret || '', 'sys_code': '900', 'lang': '_en_US' },
        body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (data?.result_data?.token) {
        console.log(`[sungrowWebLogin] Success at ${path}`);
        return { token: data.result_data.token, user_id: data.result_data.user_id };
      }
    } catch(e) {}
  }
  return null;
}

async function sungrowPost(base_url, path, appkey, app_secret, sys_code, token, user_id, body = {}) {
  const fullBody = { appkey, token, user_id, req_serial_num: Date.now().toString(36) + Math.random().toString(36).slice(2), ...body };
  const res = await fetch(`${base_url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-key': app_secret || '', 'sys_code': sys_code, 'lang': '_en_US' },
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
    const psIdStr = String(ps_id);

    const connections = await base44.asServiceRole.entities.ApiConnection.filter({ id: connection_id });
    const conn = connections[0];
    if (!conn) return Response.json({ error: 'Connection not found' }, { status: 404 });

    const cfg = conn.config;
    const candidates = [];
    if (cfg.base_url?.trim()) candidates.push(cfg.base_url.trim().replace(/\/$/, ''));
    candidates.push('https://gateway.isolarcloud.eu', 'https://gateway.isolarcloud.com.hk');

    let result = null;

    for (const baseUrl of candidates) {
      if (result) break;

      // Try both sys_code 901 (OpenAPI) and 900 (Web Portal) sessions
      const sessions = [];

      const s901 = await sungrowOpenApiLogin(cfg, baseUrl).catch(() => null);
      if (s901) sessions.push({ ...s901, sys_code: '901' });

      const s900 = await sungrowWebLogin(cfg, baseUrl).catch(() => null);
      if (s900) sessions.push({ ...s900, sys_code: '900' });

      for (const sess of sessions) {
        if (result) break;

        const post = (path, body) => sungrowPost(baseUrl, path, cfg.app_key, cfg.app_secret, sess.sys_code, sess.token, sess.user_id, body);

        if (timeframe === 'day') {
          const endpoints = [
            { path: '/v1/powerStationService/queryPowerStationByDay',   body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/powerStationService/queryDeviceByDay',          body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/powerStationService/queryPsKpiForDay',          body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsDay',                                  body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsDay',                                  body: { ps_id_list: [psIdStr], date_id: date } },
            { path: '/openapi/queryPsDay',                                body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPowerStationPowerCurve',                 body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getDayPowerCurve',                          body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsKpiDay',                               body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getStationPowerByHour',                     body: { ps_id: psIdStr, date: date } },
            { path: '/openapi/queryPsKpiForHour',                         body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/api/queryPsDay',                                 body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/api/getPsDay',                                   body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/api/getDayPowerCurve',                           body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/api/getPowerStationPowerCurve',                  body: { ps_id: psIdStr, date_id: date } },
          ];
          for (const ep of endpoints) {
            const res = await post(ep.path, ep.body);
            const code = String(res?.result_code || '');
            console.log(`[getSungrowGraph day] ${ep.path} sys=${sess.sys_code} code=${code}`);
            if (code === '1') { result = { endpoint: ep.path, data: res.result_data }; break; }
          }
        } else if (timeframe === 'month') {
          const endpoints = [
            { path: '/v1/powerStationService/queryPowerStationByMonth', body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/powerStationService/queryPsKpiForMonth',       body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsMonth',                               body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsMonth',                               body: { ps_id_list: [psIdStr], date_id: date } },
            { path: '/openapi/queryPsMonth',                             body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsKpiMonth',                            body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsKpiMonth',                            body: { ps_id: psIdStr, month: date } },
            { path: '/openapi/queryPsKpiForDay',                         body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getMonthPowerGeneration',                  body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/api/queryPsMonth',                              body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/api/getPsMonth',                                body: { ps_id: psIdStr, date_id: date } },
          ];
          for (const ep of endpoints) {
            const res = await post(ep.path, ep.body);
            const code = String(res?.result_code || '');
            console.log(`[getSungrowGraph month] ${ep.path} sys=${sess.sys_code} code=${code} sample=${JSON.stringify(res?.result_data)?.substring(0,150)}`);
            if (code === '1') { result = { endpoint: ep.path, data: res.result_data }; break; }
          }
        } else if (timeframe === 'year') {
          const endpoints = [
            { path: '/v1/powerStationService/queryPowerStationByYear',  body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/powerStationService/queryPsKpiForYear',        body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsYear',                                body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsYear',                                body: { ps_id_list: [psIdStr], date_id: date } },
            { path: '/openapi/queryPsYear',                              body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsKpiYear',                             body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getPsKpiYear',                             body: { ps_id: psIdStr, year: date } },
            { path: '/openapi/queryPsKpiForMonth',                       body: { ps_id: psIdStr, date_id: date } },
            { path: '/openapi/getYearPowerGeneration',                   body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/api/queryPsYear',                               body: { ps_id: psIdStr, date_id: date } },
            { path: '/v1/api/getPsYear',                                 body: { ps_id: psIdStr, date_id: date } },
          ];
          for (const ep of endpoints) {
            const res = await post(ep.path, ep.body);
            const code = String(res?.result_code || '');
            console.log(`[getSungrowGraph year] ${ep.path} sys=${sess.sys_code} code=${code}`);
            if (code === '1') { result = { endpoint: ep.path, data: res.result_data }; break; }
          }
        }
      }
    }

    // Fallback: build from DB snapshots / site aggregates
    if (!result) {
      console.log(`[getSungrowGraph] No live endpoint worked, trying DB fallback...`);
      result = await buildFromDbFallback(base44, ps_id, timeframe, date);
    }

    return Response.json({ success: true, result });
  } catch(error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function buildFromDbFallback(base44, ps_id, timeframe, date) {
  try {
    const sites = await base44.asServiceRole.entities.Site.filter({ sungrow_station_id: String(ps_id) });
    const site = sites[0];
    if (!site) return null;

    if (timeframe === 'month') {
      const yearMonth = date.slice(0,4) + '-' + date.slice(4,6);
      const snaps = await base44.asServiceRole.entities.SiteGraphSnapshot.filter({ station_id: `sg_${ps_id}` });
      const monthSnaps = snaps.filter(s => s.date_key && s.date_key.startsWith(yearMonth));
      if (monthSnaps.length > 0) {
        const dataList = monthSnaps.map(s => ({ date_id: s.date_key.replace(/-/g,''), energy: s.daily_yield_kwh || 0 }));
        return { endpoint: 'db_snapshot', data: { dataList } };
      }
    } else if (timeframe === 'year') {
      const snaps = await base44.asServiceRole.entities.SiteGraphSnapshot.filter({ station_id: `sg_${ps_id}` });
      const yearSnaps = snaps.filter(s => s.date_key && s.date_key.startsWith(date));
      const byMonth = {};
      yearSnaps.forEach(s => {
        const m = s.date_key?.slice(5,7);
        if (m) byMonth[m] = (byMonth[m] || 0) + (s.daily_yield_kwh || 0);
      });
      const dataList = Object.entries(byMonth).map(([m, energy]) => ({ date_id: date + m, energy }));
      if (dataList.length > 0) return { endpoint: 'db_snapshot', data: { dataList } };
    }

    return { endpoint: 'site_aggregate', data: {
      daily_yield: site.daily_yield_kwh,
      monthly_yield: site.monthly_yield_kwh,
      yearly_yield: site.yearly_yield_kwh,
      lifetime_yield: site.lifetime_yield_kwh
    }};
  } catch(e) {
    return null;
  }
}