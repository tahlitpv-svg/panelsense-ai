import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function formatDateInTZ(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(date); // YYYY-MM-DD
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Allow both authenticated users and automation service calls
    try { await base44.auth.me(); } catch(_) {}

    const now = new Date();
    const hourJerusalem = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(now), 10);
    const wave = hourJerusalem % 3;

    const todayKey = formatDateInTZ(now, 'Asia/Jerusalem');
    const hourNum = hourJerusalem;
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayKey = formatDateInTZ(yesterday, 'Asia/Jerusalem');
    const updateYesterdayToo = hourNum <= 6;

    const sites = await base44.asServiceRole.entities.Site.list();
    const havingStation = (sites || []).filter(s => !!s.solis_station_id);
    havingStation.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

    const selected = havingStation.filter((_, idx) => (idx % 3) === wave);

    async function fetchDayFromSolis(stationId, dateKey) {
      const endpoint = '/v1/api/stationDay';
      const body = { id: stationId, time: dateKey, timezone: 2 };
      const res = await base44.asServiceRole.functions.invoke('getSolisGraphData', { endpoint, body });
      const ok = res?.data?.success && Array.isArray(res?.data?.data);
      const raw = ok ? res.data.data : [];

      // Extract all data points with their real time labels from Solis
      // timeStr can be "2026-03-05 06:15:00" OR just "06:15:00"
      const mapped = raw.map(item => {
        let label = '';
        if (item.timeStr) {
          const ts = item.timeStr.trim();
          if (ts.includes(' ')) {
            // Full datetime: "2026-03-05 06:15:00"
            label = ts.split(' ')[1]?.slice(0, 5) || '';
          } else {
            // Time only: "06:15:00"
            label = ts.slice(0, 5);
          }
        }
        const valueKw = parseFloat(((parseFloat(item.power) || 0) / 1000).toFixed(2));
        return { time: label, value: isFinite(valueKw) ? valueKw : 0 };
      }).filter(d => d.time !== ''); // only keep items with a valid time label

      mapped.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      return mapped;
    }

    let processed = 0;
    for (const site of selected) {
      const stationId = site.solis_station_id;
      if (!stationId) continue;

      const todayData = await fetchDayFromSolis(stationId, todayKey);
      const existingToday = await base44.asServiceRole.entities.SiteGraphSnapshot.filter({ station_id: stationId, date_key: todayKey });
      if (existingToday && existingToday[0]) {
        await base44.asServiceRole.entities.SiteGraphSnapshot.update(existingToday[0].id, { data: todayData });
      } else {
        await base44.asServiceRole.entities.SiteGraphSnapshot.create({ station_id: stationId, date_key: todayKey, data: todayData });
      }
      processed++;

      if (updateYesterdayToo) {
        const yData = await fetchDayFromSolis(stationId, yesterdayKey);
        const exY = await base44.asServiceRole.entities.SiteGraphSnapshot.filter({ station_id: stationId, date_key: yesterdayKey });
        if (exY && exY[0]) {
          await base44.asServiceRole.entities.SiteGraphSnapshot.update(exY[0].id, { data: yData });
        } else {
          await base44.asServiceRole.entities.SiteGraphSnapshot.create({ station_id: stationId, date_key: yesterdayKey, data: yData });
        }
      }
    }

    return Response.json({ success: true, processed, wave, totalSites: havingStation.length, selectedCount: selected.length, todayKey, updatedYesterday: updateYesterdayToo });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
});