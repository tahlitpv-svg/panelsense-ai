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

    // For each site snapshot, find the last known value in each 15-min bucket
    const BUCKET_MINUTES = 15;
    // Build per-site time series: stationId -> [{minutes, value}]
    const perSite = {};
    allSnaps.forEach(snap => {
      const sid = snap.station_id || snap.id;
      if (!perSite[sid]) perSite[sid] = [];
      (snap.data || []).forEach(pt => {
        if (!pt.time) return;
        const [h, m] = pt.time.split(':').map(Number);
        const mins = (h || 0) * 60 + (m || 0);
        perSite[sid].push({ minutes: mins, value: pt.value || 0 });
      });
    });

    // Sort each site's data by time
    Object.values(perSite).forEach(arr => arr.sort((a, b) => a.minutes - b.minutes));

    // Generate 15-min buckets from 05:00 to 20:00
    const buckets = [];
    for (let m = 5 * 60; m <= 20 * 60; m += BUCKET_MINUTES) {
      buckets.push(m);
    }

    // For each bucket, for each site, find the last data point <= bucket time
    // This gives us the "current power" of each site at that moment
    const hourlyData = buckets.map(bucketMins => {
      let total = 0;
      Object.values(perSite).forEach(siteData => {
        // Find the last reading at or before this bucket
        let lastVal = 0;
        for (let i = siteData.length - 1; i >= 0; i--) {
          if (siteData[i].minutes <= bucketMins) {
            lastVal = siteData[i].value;
            break;
          }
        }
        // Only count if the last reading is within a reasonable window (30 min)
        // to avoid stale overnight data bleeding into morning
        let closestBefore = null;
        for (let i = siteData.length - 1; i >= 0; i--) {
          if (siteData[i].minutes <= bucketMins) {
            closestBefore = siteData[i];
            break;
          }
        }
        if (closestBefore && (bucketMins - closestBefore.minutes) <= 30) {
          total += closestBefore.value;
        }
      });

      const h = String(Math.floor(bucketMins / 60)).padStart(2, '0');
      const m = String(bucketMins % 60).padStart(2, '0');
      return { time: `${h}:${m}`, value: parseFloat(total.toFixed(2)) };
    });

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