import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // --- HOURLY AGGREGATION (from SiteGraphSnapshot) ---
    let allSnaps = [];
    let skip = 0;
    while (true) {
      const snaps = await db.entities.SiteGraphSnapshot.filter({ date_key: today }, undefined, 50, skip);
      allSnaps = allSnaps.concat(snaps);
      if (snaps.length < 50) break;
      skip += 50;
    }

    const hourlyMap = {};
    allSnaps.forEach(snap => {
      (snap.data || []).forEach(pt => {
        if (!pt.time) return;
        if (!hourlyMap[pt.time]) hourlyMap[pt.time] = 0;
        hourlyMap[pt.time] += (pt.value || 0); // values are in kW
      });
    });

    const hourlyData = Object.entries(hourlyMap)
      .map(([time, value]) => ({ time, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => a.time.localeCompare(b.time));

    const existingHourly = await db.entities.FleetGraphSnapshot.filter({ timeframe: 'hourly', date_key: today });
    if (existingHourly.length > 0) {
      await db.entities.FleetGraphSnapshot.update(existingHourly[0].id, { data: hourlyData });
    } else {
      await db.entities.FleetGraphSnapshot.create({ timeframe: 'hourly', date_key: today, data: hourlyData });
    }

    // --- DAILY AGGREGATION (from Site) ---
    const existingDaily = await db.entities.FleetGraphSnapshot.filter({ timeframe: 'daily', date_key: thisMonth });
    let dailyData = existingDaily.length > 0 ? (existingDaily[0].data || []) : [];
    
    let allSites = [];
    skip = 0;
    while (true) {
      const sitesPage = await db.entities.Site.filter({}, undefined, 50, skip);
      allSites = allSites.concat(sitesPage);
      if (sitesPage.length < 50) break;
      skip += 50;
    }

    const totalDailyYield = allSites.reduce((sum, site) => sum + (parseFloat(site.daily_yield_kwh) || 0), 0);
    const dayOfMonth = String(now.getDate()).padStart(2, '0'); 

    const existingDayIndex = dailyData.findIndex(d => d.time === dayOfMonth);
    if (existingDayIndex >= 0) {
      dailyData[existingDayIndex].value = parseFloat(totalDailyYield.toFixed(2));
    } else {
      dailyData.push({ time: dayOfMonth, value: parseFloat(totalDailyYield.toFixed(2)) });
    }
    dailyData.sort((a, b) => a.time.localeCompare(b.time));

    if (existingDaily.length > 0) {
      await db.entities.FleetGraphSnapshot.update(existingDaily[0].id, { data: dailyData });
    } else {
      await db.entities.FleetGraphSnapshot.create({ timeframe: 'daily', date_key: thisMonth, data: dailyData });
    }

    return Response.json({
      success: true,
      hourly_points: hourlyData.length,
      daily_points: dailyData.length,
      synced_at: new Date().toISOString()
    });

  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});