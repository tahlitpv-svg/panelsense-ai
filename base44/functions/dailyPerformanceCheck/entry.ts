import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Fetch all sites
    const sites = await base44.asServiceRole.entities.Site.list();
    
    if (!sites || sites.length === 0) {
      return Response.json({ message: 'No sites to analyze' });
    }

    // Group sites by region
    const regionGroups = {};
    sites.forEach(site => {
      const region = site.region_tag || 'unknown';
      if (!regionGroups[region]) {
        regionGroups[region] = [];
      }
      regionGroups[region].push(site);
    });

    const alerts = [];

    // Analyze each region
    for (const [region, regionSites] of Object.entries(regionGroups)) {
      // Calculate average specific yield (kWh/kWp) for the region
      const validSites = regionSites.filter(s => s.dc_capacity_kwp > 0 && s.daily_yield_kwh > 0);
      
      if (validSites.length === 0) continue;

      const specificYields = validSites.map(s => ({
        site: s,
        specificYield: s.daily_yield_kwh / s.dc_capacity_kwp
      }));

      const avgSpecificYield = specificYields.reduce((sum, s) => sum + s.specificYield, 0) / specificYields.length;
      const threshold = avgSpecificYield * 0.85; // 15% below average is considered low

      // Check each site against the regional average
      for (const { site, specificYield } of specificYields) {
        if (specificYield < threshold && site.status === 'online') {
          // Create alert for underperforming site
          const existingAlerts = await base44.asServiceRole.entities.Alert.filter({
            site_id: site.id,
            type: 'low_production',
            is_resolved: false
          });

          // Only create new alert if one doesn't exist
          if (existingAlerts.length === 0) {
            await base44.asServiceRole.entities.Alert.create({
              site_id: site.id,
              site_name: site.name,
              type: 'low_production',
              severity: 'warning',
              message: `אתר ${site.name} מייצר ${specificYield.toFixed(2)} kWh/kWp לעומת ממוצע אזורי של ${avgSpecificYield.toFixed(2)} kWh/kWp באזור ${region}`,
              is_resolved: false
            });

            alerts.push({
              site: site.name,
              region,
              specificYield: specificYield.toFixed(2),
              avgSpecificYield: avgSpecificYield.toFixed(2),
              difference: ((1 - specificYield / avgSpecificYield) * 100).toFixed(1)
            });

            // Update site status to warning
            await base44.asServiceRole.entities.Site.update(site.id, {
              status: 'warning'
            });
          }
        }
      }
    }

    return Response.json({
      success: true,
      message: `בדיקה הושלמה בהצלחה`,
      alertsCreated: alerts.length,
      alerts: alerts
    });

  } catch (error) {
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});