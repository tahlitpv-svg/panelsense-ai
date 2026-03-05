import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowRight, MapPin, Wrench, Calendar, BarChart3, Settings as SettingsIcon, Sun, Zap, Droplets, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import MPPTTable from "../components/inverter/MPPTTable";
import EfficiencyGauge from "../components/inverter/EfficiencyGauge";
import HistoricalInverterChart from "../components/inverter/HistoricalInverterChart";
import ProductionAnalysis from "../components/site/ProductionAnalysis";
import SiteConfiguration from "../components/site/SiteConfiguration";
import SiteProductionChart from "../components/site/SiteProductionChart";

export default function SiteDetails() {
  const [activeTab, setActiveTab] = useState('overview');
  const urlParams = new URLSearchParams(window.location.search);
  const siteId = urlParams.get('id');

  const { data: site } = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => base44.entities.Site.filter({ id: siteId }).then(sites => sites[0]),
    enabled: !!siteId
  });

  const { data: inverters = [] } = useQuery({
    queryKey: ['inverters', siteId],
    queryFn: () => base44.entities.Inverter.filter({ site_id: siteId }),
    enabled: !!siteId
  });

  const { data: systemSettings } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const result = await base44.entities.SystemSettings.list();
      return result[0] || null;
    }
  });

  if (!site) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400">טוען נתוני אתר...</div>
      </div>
    );
  }

  // Calculate average expected annual yield (kWh/kWp) based on strings
  let averageKwhPerKwp = null;
  const strings = site.string_configs || [];
  
  if (strings.length > 0 && systemSettings?.orientation_kwh_per_kwp) {
    const totalAnnualKwh = strings.reduce((sum, s) => {
      const pw = Number(site.panel_watt) || 0;
      const n = Number(s.num_panels) || 0;
      const kwp = (n * pw) / 1000;
      const orientation = s.orientation || 'south';
      const annualKwhPerKwp = parseFloat(systemSettings.orientation_kwh_per_kwp[orientation]) || 0;
      return sum + (kwp * annualKwhPerKwp);
    }, 0);
    
    const totalPowerW = strings.reduce((sum, s) => sum + ((Number(s.num_panels) || 0) * (Number(site.panel_watt) || 0)), 0);
    const totalKwp = totalPowerW / 1000;
    
    if (totalKwp > 0) {
      averageKwhPerKwp = totalAnnualKwh / totalKwp;
    }
  }

  // Data will be fetched dynamically in SiteProductionChart

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('Dashboard')}>
            <Button variant="ghost" size="icon" className="rounded-full bg-white border border-slate-200 text-slate-500 hover:text-orange-500 hover:bg-orange-50 shrink-0 w-8 h-8 md:w-10 md:h-10">
              <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-slate-800 leading-tight">{site.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm text-slate-500 mt-1">
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span>{site.region_tag}</span>
              </div>
              <Badge variant="outline" className="font-normal bg-white border-slate-200 text-slate-600 text-[10px] md:text-xs">
                {site.owner === 'delkal_energy' ? 'אתר דלקל' : 'לקוח חיצוני'}
              </Badge>
              {site.status === 'warning' && (
                <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 gap-1 text-[10px] md:text-xs">
                  <AlertTriangle className="w-3 h-3" /> תקלה
                </Badge>
              )}
            </div>
          </div>
        </div>
        {site.cleaning_recommended && (
          <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 gap-1.5 shrink-0 text-xs">
            <Droplets className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">דורש ניקוי</span>
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
        <TabsList className="bg-white p-1 border border-slate-200 h-10 md:h-11 w-full rounded-xl grid grid-cols-3">
          <TabsTrigger value="overview" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600 text-slate-500 gap-1.5 rounded-lg text-xs md:text-sm">
            <Wrench className="w-3.5 h-3.5 md:w-4 md:h-4" />
            סקירה
          </TabsTrigger>
          <TabsTrigger value="analysis" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600 text-slate-500 gap-1.5 rounded-lg text-xs md:text-sm">
            <BarChart3 className="w-3.5 h-3.5 md:w-4 md:h-4" />
            ייצור
          </TabsTrigger>
          <TabsTrigger value="config" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600 text-slate-500 gap-1.5 rounded-lg text-xs md:text-sm">
            <SettingsIcon className="w-3.5 h-3.5 md:w-4 md:h-4" />
            הגדרות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 md:space-y-6">
          {/* KPI row - horizontal scroll on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="p-3 md:p-5 border border-slate-200 shadow-sm bg-white">
              <div className="text-slate-500 text-[10px] md:text-xs font-medium uppercase mb-1">תפוקה יומית</div>
              <div className="text-lg md:text-2xl font-bold text-slate-800">{site.daily_yield_kwh?.toFixed(0)} <span className="text-xs md:text-sm font-normal text-slate-500">kWh</span></div>
              <div className="text-[10px] md:text-xs text-emerald-600 mt-0.5">₪{((site.daily_yield_kwh || 0) * (site.tariff_per_kwh || 0)).toFixed(0)}</div>
            </Card>

            <Card className="p-3 md:p-5 border border-slate-200 shadow-sm bg-white">
              <div className="text-slate-500 text-[10px] md:text-xs font-medium uppercase mb-1 flex items-center gap-1">
                <Sun className="w-3.5 h-3.5" />
                ממוצע ייצור שנתי צפוי
              </div>
              {strings.length === 0 ? (
                <div className="text-sm font-medium text-slate-400 mt-2">לא הוגדרו סטרינגים באתר זה</div>
              ) : averageKwhPerKwp !== null ? (
                <div className="text-lg md:text-2xl font-bold text-slate-800">
                  {averageKwhPerKwp.toFixed(0)} <span className="text-xs md:text-sm font-normal text-slate-500">kWh/kWp</span>
                </div>
              ) : (
                <div className="text-sm font-medium text-slate-400 mt-2">חסרים נתוני פאנלים או הגדרות מערכת</div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="lg:col-span-2 space-y-4 md:space-y-6">
              <SiteProductionChart stationId={site.solis_station_id} />

              {/* Tech Specs */}
              <Card className="p-4 md:p-6 border border-slate-200 shadow-sm bg-white">
                <h3 className="text-base md:text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-400" />
                  מפרט טכני
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 text-sm">
                  {[
                    { l: 'הספק DC', v: `${site.dc_capacity_kwp} kWp` },
                    { l: 'הספק AC', v: `${site.ac_capacity_kw} kW` },
                    { l: 'ממירים', v: site.inverter_type || 'N/A' },
                    { l: 'פאנלים', v: site.panel_type || 'N/A' },
                    { l: 'אזימוט', v: `${site.azimuth_deg}°` },
                    { l: 'הטיה', v: `${site.tilt_deg}°` },
                    { l: 'התקנה', v: site.mounting_type === 'roof' ? 'גג' : site.mounting_type === 'ground' ? 'קרקע' : 'עוקב' },
                  ].map((item, i) => (
                    <div key={i}>
                      <div className="text-slate-500 text-xs mb-0.5">{item.l}</div>
                      <div className="font-medium text-slate-800 text-sm">{item.v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-4">
              {/* Maintenance Card */}
              <Card className="p-4 md:p-6 border border-slate-200 shadow-sm bg-white">
                <h3 className="text-base md:text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  תחזוקה
                </h3>
                <div className="space-y-3 text-sm border-r-2 border-slate-100 pr-4 mr-1">
                  <div>
                    <div className="text-slate-500 text-xs mb-0.5">ניקוי אחרון</div>
                    <div className="font-medium text-slate-800 text-sm">
                      {site.last_cleaning_date ? new Date(site.last_cleaning_date).toLocaleDateString('he-IL') : 'אין נתונים'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs mb-0.5">מרווח ניקוי</div>
                    <div className="font-medium text-slate-800 text-sm">{site.cleaning_interval_days} ימים</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs mb-0.5">תאריך התקנה</div>
                    <div className="font-medium text-slate-800 text-sm">
                      {site.installation_date ? new Date(site.installation_date).toLocaleDateString('he-IL') : 'אין נתונים'}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Inverters Section */}
          <div>
            <h2 className="text-base md:text-xl font-bold text-slate-800 mb-4">ממירים ומערכת חשמל</h2>
            {inverters.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm">
                אין ממירים מוגדרים לאתר זה
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:gap-6">
                {inverters.map(inverter => (
                  <Card key={inverter.id} className="p-4 md:p-6 border border-slate-200 shadow-sm bg-white">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg">
                          <Zap className="w-4 h-4 text-slate-500" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 text-sm md:text-base">{inverter.name}</h3>
                          <p className="text-xs text-slate-500">{inverter.model}</p>
                        </div>
                      </div>
                      <Badge className={`${inverter.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} border-0 text-xs`}>
                        {inverter.status === 'online' ? 'מקוון' : 'תקלה'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                      <div className="lg:col-span-2">
                        <MPPTTable mpptStrings={inverter.mppt_strings} />
                      </div>
                      <div className="flex items-center justify-center bg-slate-50 rounded-xl p-4">
                        <EfficiencyGauge efficiency={inverter.efficiency_percent} />
                      </div>
                    </div>
                    <div className="mt-6 border-t border-slate-100 pt-4 md:pt-6">
                      <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm md:text-base">
                        <BarChart3 className="w-4 h-4 text-green-600" />
                        גרף מהפך
                      </h4>
                      <HistoricalInverterChart
                        inverterId={inverter.solis_inverter_id}
                        inverterSn={inverter.solis_sn}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="analysis">
          <ProductionAnalysis site={site} />
        </TabsContent>

        <TabsContent value="config">
          <SiteConfiguration site={site} />
        </TabsContent>
      </Tabs>
    </div>
  );
}