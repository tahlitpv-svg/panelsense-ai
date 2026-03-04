import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function formatDateInTZ(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(date); // YYYY-MM-DD
}

function buildTicks0300to2100() {
  const out = [];
  for (let h = 3; h <= 21; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Authentication (may be null when invoked by automation)
    await base44.auth.isAuthenticated().catch(() => false);

    const now = new Date();
    const hourJerusalem = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(now), 10);
    const wave = hourJerusalem % 3; // rotate waves each hour (0,1,2)

    // Determine which dates to update
    const todayKey = formatDateInTZ(now, 'Asia/Jerusalem');
    const hourInJerusalem = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(now);
    const hourNum = parseInt(hourInJerusalem, 10);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayKey = formatDateInTZ(yesterday, 'Asia/Jerusalem');

    const updateYesterdayToo = hourNum <= 6; // backfill in early morning

    // Fetch sites (service role for background job)
    const sites = await base44.asServiceRole.entities.Site.list();
    const havingStation = (sites || []).filter(s => !!s.solis_station_id);
    // stable order for consistent partitioning
    havingStation.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

    const selected = havingStation.filter((_, idx) => (idx % 3) === wave);

    const ticks = buildTicks0300to2100();

    async function fetchDayFromSolis(stationId, dateKey) {
      const endpoint = '/v1/api/stationDay';
      const body = { id: stationId, time: dateKey, timezone: 2 };
      const res = await base44.asServiceRole.functions.invoke('getSolisGraphData', { endpoint, body });
      const ok = res?.data?.success && Array.isArray(res?.data?.data);
      const raw = ok ? res.data.data : [];

      const mapped = raw.map(item => {
        const labelRaw = item.timeStr ? item.timeStr.split(' ')[1]?.slice(0, 5) : item.time;
        const label = (labelRaw || '').slice(0,5);
        const valueKw = parseFloat(((parseFloat(item.power) || 0) / 1000).toFixed(2));
        return { time: label, value: isFinite(valueKw) ? valueKw : 0 };
      });

      // Ensure full ticks 03:00–21:00 present, fill 0 for missing
      ticks.forEach(t => { if (!mapped.find(d => d.time === t)) mapped.push({ time: t, value: 0 }); });
      mapped.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      return mapped;
    }

    let processed = 0;
    for (const site of selected) {
      const stationId = site.solis_station_id;
      if (!stationId) continue;

      // Today
      const todayData = await fetchDayFromSolis(stationId, todayKey);
      const existingToday = await base44.asServiceRole.entities.SiteGraphSnapshot.filter({ station_id: stationId, date_key: todayKey });
      if (existingToday && existingToday[0]) {
        await base44.asServiceRole.entities.SiteGraphSnapshot.update(existingToday[0].id, { data: todayData });
      } else {
        await base44.asServiceRole.entities.SiteGraphSnapshot.create({ station_id: stationId, date_key: todayKey, data: todayData });
      }
      processed++;

      // Yesterday (early morning backfill)
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