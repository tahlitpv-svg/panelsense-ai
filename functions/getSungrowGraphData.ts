import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createHash } from 'node:crypto';

function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex');
}

// The iSolarCloud web portal uses this public app key (not user's API key)
const WEB_APP_KEY = '93D72E60331ABDCDC7B39ADC2D1F32B3';

// Login via iSolarCloud Web Portal API (same creds, public app key)
async function sungrowWebPortalLogin(config, baseUrl) {
  const paths = [
    '/v1/userService/login',
    '/openapi/login',
  ];
  for (const path of paths) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-key': WEB_APP_KEY,
          'sys_code': '901',
          'lang': '_en_US',
          'User-Agent': 'Mozilla/5.0'
        },
        body: JSON.stringify({
          appkey: WEB_APP_KEY,
          user_account: config.user_account,
          user_password: md5(config.user_password),
          login_type: '0'
        })
      });
      const data = JSON.parse(await res.text());
      if (data?.result_data?.token) {
        console.log(`[webPortalLogin] Success at ${path} with WEB_APP_KEY`);
        return { token: data.result_data.token, user_id: data.result_data.user_id };
      }
    } catch(e) {}
  }
  return null;
}

// Login via OpenAPI (user's own app_key + app_secret)
async function sungrowOpenApiLogin(config, baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/openapi/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-key': config.app_secret, 'sys_code': '901', 'lang': '_en_US' },
      body: JSON.stringify({ appkey: config.app_key, user_account: config.user_account, user_password: md5(config.user_password), login_type: '0' })
    });
    const data = JSON.parse(await res.text());
    if (data?.result_data?.token) return { token: data.result_data.token, user_id: data.result_data.user_id };
  } catch(e) {}
  return null;
}

async function sungrowPost(base_url, path, appkey, access_key, token, user_id, body = {}) {
  const fullBody = { appkey, token, user_id, req_serial_num: Date.now().toString(36) + Math.random().toString(36).slice(2), ...body };
  const res = await fetch(`${base_url}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-key': access_key,
      'sys_code': '901',
      'lang': '_en_US',
      'User-Agent': 'Mozilla/5.0'
    },
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

      // Try OAuth2 first if available, then web portal, then openapi
      const sessions = [];

      // OAuth2 session (highest priority)
      if (cfg.auth_method === 'oauth2' && cfg.oauth_access_token) {
        const oauthBaseUrl = cfg.oauth_base_url || baseUrl;
        sessions.push({ 
          token: cfg.oauth_access_token, 
          user_id: cfg.oauth_user_id || '', 
          appkey: cfg.app_key, 
          access_key: cfg.app_secret, 
          label: 'oauth2' 
        });
        console.log(`[getSungrowGraph] Using OAuth2 token`);
      }

      const webSess = await sungrowWebPortalLogin(cfg, baseUrl);
      if (webSess) sessions.push({ ...webSess, appkey: WEB_APP_KEY, access_key: WEB_APP_KEY, label: 'web' });

      const apiSess = await sungrowOpenApiLogin(cfg, baseUrl);
      if (apiSess) sessions.push({ ...apiSess, appkey: cfg.app_key, access_key: cfg.app_secret, label: 'openapi' });

      for (const sess of sessions) {
        if (result) break;

        const post = (path, body) => sungrowPost(baseUrl, path, sess.appkey, sess.access_key, sess.token, sess.user_id, body);

        const endpointSets = buildEndpoints(timeframe, psIdStr, date);

        for (const ep of endpointSets) {
          const res = await post(ep.path, ep.body);
          const code = String(res?.result_code || '');
          const sample = JSON.stringify(res?.result_data)?.substring(0, 200);
          console.log(`[getSungrowGraph ${timeframe}] ${ep.path} sess=${sess.label} code=${code} sample=${sample}`);
          if (code === '1') {
            result = { endpoint: ep.path, data: res.result_data };
            break;
          }
        }
      }
    }

    // Fallback: try to get aggregated data from station list API (works on Basic plan)
    if (!result) {
      result = await tryStationListFallback(base44, conn, ps_id, timeframe, date);
    }

    // Final fallback: build from DB snapshots
    if (!result) {
      result = await buildFromDbFallback(base44, ps_id, timeframe, date);
    }

    return Response.json({ success: true, result });
  } catch(error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Use the getPowerStationList endpoint (available on Basic plan) to get aggregate yields
// then combine with DB snapshots for a more complete picture
async function tryStationListFallback(base44, conn, ps_id, timeframe, date) {
  try {
    const cfg = conn.config;
    const psIdStr = String(ps_id);
    
    // Login to get token
    let token, user_id, base_url;
    if (cfg.auth_method === 'oauth2' && cfg.oauth_access_token) {
      token = cfg.oauth_access_token;
      user_id = cfg.oauth_user_id || '';
      base_url = (cfg.oauth_base_url || cfg.base_url || 'https://gateway.isolarcloud.eu').replace(/\/$/, '');
    } else {
      const loginRes = await sungrowOpenApiLogin(cfg, (cfg.base_url || 'https://gateway.isolarcloud.eu').replace(/\/$/, ''));
      if (!loginRes) return null;
      token = loginRes.token;
      user_id = loginRes.user_id;
      base_url = (cfg.base_url || 'https://gateway.isolarcloud.eu').replace(/\/$/, '');
    }

    // Fetch station list to get current aggregate values
    const listRes = await sungrowPost(base_url, '/openapi/getPowerStationList', cfg.app_key, cfg.app_secret, token, user_id, {
      curPage: 1, size: 200
    });
    const stations = listRes?.result_data?.pageList || listRes?.result_data?.list || [];
    const station = stations.find(s => String(s.ps_id) === psIdStr);
    if (!station) return null;

    function parseField(field) {
      if (!field && field !== 0) return 0;
      if (typeof field === 'object' && field !== null && 'value' in field) {
        const num = parseFloat(field.value) || 0;
        const unit = (field.unit || '').toLowerCase();
        if (unit === 'w') return num / 1000;
        if (unit === 'mwh') return num * 1000;
        if (unit === 'gwh') return num * 1000000;
        return num;
      }
      return parseFloat(field) || 0;
    }

    const todayYield = parseField(station.today_energy);
    const monthYield = parseField(station.month_energy);
    const yearYield = parseField(station.year_energy);
    const totalYield = parseField(station.total_energy);

    console.log(`[stationListFallback] ps_id=${psIdStr} today=${todayYield} month=${monthYield} year=${yearYield}`);

    // Get DB snapshots for this station
    const snapStationId = `sg_${psIdStr}`;
    const allSnaps = await base44.asServiceRole.entities.SiteGraphSnapshot.filter({ station_id: snapStationId });
    
    if (timeframe === 'month') {
      // dateStr format: "202603"
      const year = date.slice(0, 4);
      const month = date.slice(4, 6);
      const yearMonth = `${year}-${month}`;
      const monthSnaps = allSnaps.filter(s => s.date_key && s.date_key.startsWith(yearMonth));
      
      // Build daily data from snapshots
      const dataList = monthSnaps.map(s => ({
        date_id: s.date_key.replace(/-/g, ''),
        energy: s.daily_yield_kwh || 0
      }));
      
      // Check if we're looking at current month - if so, use live monthYield as reference
      const now = new Date();
      const isCurrentMonth = now.getFullYear() === parseInt(year) && (now.getMonth() + 1) === parseInt(month);
      
      if (dataList.length > 0) {
        return { endpoint: 'station_list_monthly', data: { dataList, monthYield: isCurrentMonth ? monthYield : null } };
      }
      
      // If no snapshots at all for this month but it's current month, return the total
      if (isCurrentMonth && monthYield > 0) {
        return { endpoint: 'site_aggregate', data: { monthly_yield: monthYield } };
      }
    }

    if (timeframe === 'year') {
      const yearStr = date.slice(0, 4);
      const yearSnaps = allSnaps.filter(s => s.date_key && s.date_key.startsWith(yearStr));
      
      // Aggregate by month
      const byMonth = {};
      yearSnaps.forEach(s => {
        const m = s.date_key?.slice(5, 7);
        if (m) byMonth[m] = (byMonth[m] || 0) + (s.daily_yield_kwh || 0);
      });
      
      const dataList = Object.entries(byMonth).map(([m, energy]) => ({ date_id: yearStr + m, energy }));
      
      const now = new Date();
      const isCurrentYear = now.getFullYear() === parseInt(yearStr);
      
      if (dataList.length > 0) {
        return { endpoint: 'station_list_yearly', data: { dataList, yearYield: isCurrentYear ? yearYield : null } };
      }
      
      if (isCurrentYear && yearYield > 0) {
        return { endpoint: 'site_aggregate', data: { yearly_yield: yearYield } };
      }
    }

    if (timeframe === 'day') {
      // For daily power curve, check DB snapshots
      const dateKey = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
      const daySnap = allSnaps.find(s => s.date_key === dateKey);
      if (daySnap && daySnap.data && daySnap.data.length > 0) {
        return { endpoint: 'db_day_snapshot', data: { pointList: daySnap.data } };
      }
    }

    return null;
  } catch(e) {
    console.log(`[stationListFallback] Error: ${e.message}`);
    return null;
  }
}

function buildEndpoints(timeframe, psIdStr, date) {
  if (timeframe === 'day') {
    return [
      { path: '/v1/powerStationService/queryPsDay',          body: { ps_id: psIdStr, date_id: date } },
      { path: '/v1/powerStationService/queryPsByDay',         body: { ps_id: psIdStr, date_id: date } },
      { path: '/v1/powerStationService/queryPsKpiForHour',   body: { ps_id: psIdStr, date_id: date } },
      { path: '/v1/powerStationService/queryDeviceByDay',     body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsDay',                            body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsDay',                            body: { ps_id_list: [psIdStr], date_id: date } },
      { path: '/openapi/queryPsDay',                          body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPowerStationPowerCurve',           body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getDayPowerCurve',                    body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsKpiDay',                         body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsKpiDay',                         body: { ps_id_list: [psIdStr], date_id: date } },
      { path: '/openapi/queryPsKpiForHour',                   body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getStationPowerByHour',               body: { ps_id: psIdStr, date: date } },
    ];
  }
  if (timeframe === 'month') {
    return [
      { path: '/v1/powerStationService/queryPsMonth',        body: { ps_id: psIdStr, date_id: date } },
      { path: '/v1/powerStationService/queryPsByMonth',       body: { ps_id: psIdStr, date_id: date } },
      { path: '/v1/powerStationService/queryPsKpiForDay',    body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsMonth',                          body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsMonth',                          body: { ps_id_list: [psIdStr], date_id: date } },
      { path: '/openapi/queryPsMonth',                        body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsKpiMonth',                       body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsKpiMonth',                       body: { ps_id: psIdStr, month: date } },
      { path: '/openapi/queryPsKpiForDay',                    body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getMonthPowerGeneration',             body: { ps_id: psIdStr, date_id: date } },
    ];
  }
  if (timeframe === 'year') {
    return [
      { path: '/v1/powerStationService/queryPsYear',         body: { ps_id: psIdStr, date_id: date } },
      { path: '/v1/powerStationService/queryPsByYear',        body: { ps_id: psIdStr, date_id: date } },
      { path: '/v1/powerStationService/queryPsKpiForMonth',  body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsYear',                           body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsYear',                           body: { ps_id_list: [psIdStr], date_id: date } },
      { path: '/openapi/queryPsYear',                         body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsKpiYear',                        body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getPsKpiYear',                        body: { ps_id: psIdStr, year: date } },
      { path: '/openapi/queryPsKpiForMonth',                  body: { ps_id: psIdStr, date_id: date } },
      { path: '/openapi/getYearPowerGeneration',              body: { ps_id: psIdStr, date_id: date } },
    ];
  }
  return [];
}

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
  } catch(e) { return null; }
}