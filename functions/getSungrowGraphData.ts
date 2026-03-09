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

// Try multiple endpoint variants and return first success
async function tryEndpoints(base_url, config, token, user_id, endpoints) {
  for (const ep of endpoints) {
    const res = await sungrowPost(base_url, ep.path, config, token, user_id, ep.body);
    const code = String(res?.result_code || '');
    const sample = JSON.stringify(res?.result_data)?.substring(0, 200);
    console.log(`[getSungrowGraph] ${ep.path} code=${code} sample=${sample}`);
    if (code === '1') {
      return { endpoint: ep.path, data: res.result_data };
    }
  }
  return null;
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

    const psIdStr = String(ps_id);
    let result = null;

    if (timeframe === 'day') {
      // date format: "20260309"
      result = await tryEndpoints(base_url, conn.config, token, user_id, [
        // OpenAPI variants
        { path: '/openapi/getPsDay',                  body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getPsDay',                  body: { ps_id_list: [psIdStr], date_id: date } },
        { path: '/openapi/queryPsDay',                body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getPowerStationPowerCurve', body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getPowerStationPowerCurve', body: { ps_id_list: [psIdStr], date_id: date } },
        { path: '/openapi/getDayPowerCurve',          body: { ps_id: psIdStr, date: date } },
        { path: '/openapi/getDayPowerCurve',          body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getPsKpiDay',               body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getPsKpiDay',               body: { ps_id_list: [psIdStr], date_id: date } },
        { path: '/openapi/queryPsKpiForHour',         body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getStationPowerByHour',     body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getStationPowerByHour',     body: { ps_id: psIdStr, date: date } },
        // v1/api variants (web portal API)
        { path: '/v1/api/queryPsDay',                 body: { ps_id: psIdStr, date_id: date } },
        { path: '/v1/api/getPsDay',                   body: { ps_id: psIdStr, date_id: date } },
        { path: '/v1/api/getDayPowerCurve',           body: { ps_id: psIdStr, date_id: date } },
        { path: '/v1/api/queryPowerStationPowerCurve',body: { ps_id: psIdStr, date_id: date } },
        { path: '/v1/api/getPowerStationPowerCurve',  body: { ps_id: psIdStr, date_id: date } },
      ]);
    } else if (timeframe === 'month') {
      // date format: "202603"
      result = await tryEndpoints(base_url, conn.config, token, user_id, [
        { path: '/openapi/getPsMonth',               body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getPsMonth',               body: { ps_id_list: [psIdStr], date_id: date } },
        { path: '/openapi/queryPsMonth',             body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getPsKpiMonth',            body: { ps_id: psIdStr, month: date } },
        { path: '/openapi/getPsKpiMonth',            body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/queryPsKpiForDay',         body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getMonthPowerGeneration',  body: { ps_id: psIdStr, month: date } },
        { path: '/openapi/getMonthPowerGeneration',  body: { ps_id: psIdStr, date_id: date } },
        { path: '/v1/api/queryPsMonth',              body: { ps_id: psIdStr, date_id: date } },
        { path: '/v1/api/getPsMonth',                body: { ps_id: psIdStr, date_id: date } },
        { path: '/v1/api/getMonthPowerGeneration',   body: { ps_id: psIdStr, date_id: date } },
      ]);
    } else if (timeframe === 'year') {
      // date format: "2026"
      result = await tryEndpoints(base_url, conn.config, token, user_id, [
        { path: '/openapi/getPsYear',               body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getPsYear',               body: { ps_id_list: [psIdStr], date_id: date } },
        { path: '/openapi/queryPsYear',             body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getPsKpiYear',            body: { ps_id: psIdStr, year: date } },
        { path: '/openapi/getPsKpiYear',            body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/queryPsKpiForMonth',      body: { ps_id: psIdStr, date_id: date } },
        { path: '/openapi/getYearPowerGeneration',  body: { ps_id: psIdStr, year: date } },
        { path: '/openapi/getYearPowerGeneration',  body: { ps_id: psIdStr, date_id: date } },
        { path: '/v1/api/queryPsYear',              body: { ps_id: psIdStr, date_id: date } },
        { path: '/v1/api/getPsYear',                body: { ps_id: psIdStr, date_id: date } },
        { path: '/v1/api/getYearPowerGeneration',   body: { ps_id: psIdStr, date_id: date } },
      ]);
    }

    // Fallback: if no graph endpoint works, build data from DB snapshots
    if (!result) {
      console.log(`[getSungrowGraph] No live endpoint worked, trying DB fallback...`);
      result = await buildFromDbSnapshots(base44, ps_id, timeframe, date);
    }

    return Response.json({ success: true, result });
  } catch(error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Build graph data from accumulated DB snapshots (for monthly/yearly views)
async function buildFromDbSnapshots(base44, ps_id, timeframe, date) {
  try {
    // Find the site by sungrow_station_id
    const sites = await base44.asServiceRole.entities.Site.filter({ sungrow_station_id: String(ps_id) });
    const site = sites[0];
    if (!site) return null;

    if (timeframe === 'month') {
      // Get daily snapshots for this month
      const snaps = await base44.asServiceRole.entities.SiteGraphSnapshot.filter({ station_id: `sg_${ps_id}` });
      const monthSnaps = snaps.filter(s => s.date_key && s.date_key.startsWith(date.slice(0,4) + '-' + date.slice(4,6)));
      if (monthSnaps.length > 0) {
        const dataList = monthSnaps.map(s => ({
          date_id: s.date_key.replace(/-/g, ''),
          energy: s.daily_yield_kwh || 0
        }));
        return { endpoint: 'db_snapshot', data: { dataList } };
      }
    } else if (timeframe === 'year') {
      // Aggregate monthly totals from daily snapshots
      const snaps = await base44.asServiceRole.entities.SiteGraphSnapshot.filter({ station_id: `sg_${ps_id}` });
      const yearSnaps = snaps.filter(s => s.date_key && s.date_key.startsWith(date));
      const byMonth = {};
      yearSnaps.forEach(s => {
        const m = s.date_key ? s.date_key.slice(5, 7) : null;
        if (m) byMonth[m] = (byMonth[m] || 0) + (s.daily_yield_kwh || 0);
      });
      const dataList = Object.entries(byMonth).map(([m, energy]) => ({ date_id: date + m, energy }));
      if (dataList.length > 0) return { endpoint: 'db_snapshot', data: { dataList } };
    }

    // Last resort: return the site's stored aggregate values as a single-point stub
    return { endpoint: 'site_aggregate', data: {
      daily_yield: site.daily_yield_kwh,
      monthly_yield: site.monthly_yield_kwh,
      yearly_yield: site.yearly_yield_kwh,
      lifetime_yield: site.lifetime_yield_kwh
    }};
  } catch(e) {
    console.log(`[getSungrowGraph] DB fallback error: ${e.message}`);
    return null;
  }
}