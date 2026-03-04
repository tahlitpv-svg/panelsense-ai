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

  if (!site) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400">טוען נתוני אתר...</div>
      </div>
    );
  }

  const totalRevenue = (site.lifetime_yield_kwh || 0) * (site.tariff_per_kwh || 0);
  const roi = site.initial_investment > 0 
    ? ((totalRevenue / site.initial_investment) * 100).toFixed(1)
    : 0;

  // Data will be fetched dynamically in SiteProductionChart

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={createPageUrl('Dashboard')}>
            <Button variant="ghost" size="icon" className="rounded-full bg-white border border-slate-200 text-slate-500 hover:text-orange-500 hover:bg-orange-50 shrink-0">
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-slate-800 truncate">{site.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span>{site.region_tag}</span>
              </div>
              <Badge variant="outline" className="font-normal bg-white border-slate-200 text-slate-600 text-[10px] px-1.5 py-0">
                {site.owner === 'delkal_energy' ? 'דלקל' : 'חיצוני'}
              </Badge>
              {site.status === 'warning' && (
                <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 gap-1 text-[10px] px-1.5 py-0">
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Tab bar — icons only on mobile */}
        <TabsList className="bg-white p-1 border border-slate-200 h-11 w-full grid grid-cols-3 rounded-xl">
          <TabsTrigger value="overview"
            className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600 text-slate-500 gap-1.5 px-2 rounded-lg h-9 text-xs"
          >
            <Wrench className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">סקירה כללית</span>
            <span className="sm:hidden">סקירה</span>
          </TabsTrigger>
          <TabsTrigger value="analysis"
            className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600 text-slate-500 gap-1.5 px-2 rounded-lg h-9 text-xs"
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">ניתוח ייצור</span>
            <span className="sm:hidden">ניתוח</span>
          </TabsTrigger>
          <TabsTrigger value="config"
            className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600 text-slate-500 gap-1.5 px-2 rounded-lg h-9 text-xs"
          >
            <SettingsIcon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">הגדרות</span>
            <span className="sm:hidden">הגדרות</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* KPI row — 3 cards, compact */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 md:p-5 border border-slate-200 shadow-sm bg-white flex items-center justify-between">
              <div>
                <div className="text-slate-500 text-[10px] font-medium uppercase mb-1">תפוקה יומית</div>
                <div className="text-lg md:text-2xl font-bold text-slate-800">{site.daily_yield_kwh?.toFixed(0)}</div>
                <div className="text-[10px] text-slate-400">kWh</div>
                <div className="text-[10px] text-emerald-600">₪{((site.daily_yield_kwh || 0) * (site.tariff_per_kwh || 0)).toFixed(0)}</div>
              </div>
              <div className="p-2 bg-orange-50 rounded-full hidden sm:block">
                <Sun className="w-5 h-5 text-orange-500" />
              </div>
            </Card>
            <Card className="p-3 md:p-5 border border-slate-200 shadow-sm bg-white flex items-center justify-between">
              <div>
                <div className="text-slate-500 text-[10px] font-medium uppercase mb-1">תפוקה שנתית</div>
                <div className="text-lg md:text-2xl font-bold text-slate-800">{(site.yearly_yield_kwh / 1000)?.toFixed(1)}</div>
                <div className="text-[10px] text-slate-400">MWh</div>
              </div>
              <div className="p-2 bg-blue-50 rounded-full hidden sm:block">
                <Zap className="w-5 h-5 text-blue-500" />
              </div>
            </Card>
            <Card className="p-3 md:p-5 border border-slate-200 shadow-sm bg-white flex items-center justify-between">
              <div>
                <div className="text-slate-500 text-[10px] font-medium uppercase mb-1">ROI</div>
                <div className="text-lg md:text-2xl font-bold text-slate-800">{roi}%</div>
                <div className="text-[10px] text-slate-400">₪{totalRevenue.toFixed(0)}</div>
              </div>
              <div className="p-2 bg-emerald-50 rounded-full hidden sm:block">
                <BarChart3 className="w-5 h-5 text-emerald-500" />
              </div>
            </Card>
          </div>

          {/* Chart */}
          <SiteProductionChart stationId={site.solis_station_id} />

          {/* Tech + Maintenance — side by side on md+ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 md:p-6 border border-slate-200 shadow-sm bg-white">
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-400" />
                מפרט טכני
              </h3>
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                {[
                  { l: 'הספק DC', v: `${site.dc_capacity_kwp} kWp` },
                  { l: 'הספק AC', v: `${site.ac_capacity_kw} kW` },
                  { l: 'סוג ממירים', v: site.inverter_type || 'N/A' },
                  { l: 'סוג פאנלים', v: site.panel_type || 'N/A' },
                  { l: 'אזימוט', v: `${site.azimuth_deg}°` },
                  { l: 'זווית הטיה', v: `${site.tilt_deg}°` },
                  { l: 'סוג התקנה', v: site.mounting_type === 'roof' ? 'גג' : site.mounting_type === 'ground' ? 'קרקע' : 'עוקב' },
                ].map((item, i) => (
                  <div key={i}>
                    <div className="text-slate-500 mb-0.5">{item.l}</div>
                    <div className="font-medium text-slate-800">{item.v}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4 md:p-6 border border-slate-200 shadow-sm bg-white">
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                תחזוקה
              </h3>
              <div className="space-y-3 text-xs border-r-2 border-slate-100 pr-3 mr-1">
                <div>
                  <div className="text-slate-500 mb-0.5">ניקוי אחרון</div>
                  <div className="font-medium text-slate-800">
                    {site.last_cleaning_date ? new Date(site.last_cleaning_date).toLocaleDateString('he-IL') : 'אין נתונים'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 mb-0.5">מרווח ניקוי מומלץ</div>
                  <div className="font-medium text-slate-800">{site.cleaning_interval_days} ימים</div>
                </div>
                <div>
                  <div className="text-slate-500 mb-0.5">תאריך התקנה</div>
                  <div className="font-medium text-slate-800">
                    {site.installation_date ? new Date(site.installation_date).toLocaleDateString('he-IL') : 'אין נתונים'}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Inverters */}
          <div>
            <h2 className="text-base font-bold text-slate-800 mb-3">ממירים</h2>
            {inverters.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm">
                אין ממירים מוגדרים לאתר זה
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {inverters.map(inverter => (
                  <Card key={inverter.id} className="p-4 md:p-6 border border-slate-200 shadow-sm bg-white">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg">
                          <Zap className="w-4 h-4 text-slate-500" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 text-sm">{inverter.name}</h3>
                          <p className="text-xs text-slate-500">{inverter.model}</p>
                        </div>
                      </div>
                      <Badge className={`${inverter.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} border-0 text-xs`}>
                        {inverter.status === 'online' ? 'מקוון' : 'תקלה'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <div className="lg:col-span-2">
                        <MPPTTable mpptStrings={inverter.mppt_strings} />
                      </div>
                      <div className="flex items-center justify-center bg-slate-50 rounded-xl p-3">
                        <EfficiencyGauge efficiency={inverter.efficiency_percent} />
                      </div>
                    </div>
                    <div className="mt-6 border-t border-slate-100 pt-4">
                      <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                        <BarChart3 className="w-4 h-4 text-green-600" />
                        היסטוריית ממיר
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