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
import MPPTChart from "../components/inverter/MPPTChart";
import StringVoltageChart from "../components/inverter/StringVoltageChart";
import ProductionAnalysis from "../components/site/ProductionAnalysis";
import SiteConfiguration from "../components/site/SiteConfiguration";

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

  // Generate hourly production data for today
  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const hour = i;
    let power = 0;
    if (hour >= 6 && hour <= 18) {
      const sunIntensity = Math.sin(((hour - 6) / 12) * Math.PI);
      power = (site.current_power_kw || 0) * sunIntensity * (0.8 + Math.random() * 0.4);
    }
    return {
      hour: `${hour.toString().padStart(2, '0')}:00`,
      power: parseFloat(power.toFixed(1)),
      energy: parseFloat((power * 1).toFixed(2))
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('Dashboard')}>
            <Button variant="ghost" size="icon" className="rounded-full bg-white border border-slate-200 text-slate-500 hover:text-orange-500 hover:bg-orange-50">
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{site.name}</h1>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>{site.region_tag}</span>
              </div>
              <Badge variant="outline" className="font-normal bg-white border-slate-200 text-slate-600">
                {site.owner === 'delkal_energy' ? 'אתר דלקל' : 'לקוח חיצוני'}
              </Badge>
              {site.status === 'warning' && (
                 <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 gap-1">
                    <AlertTriangle className="w-3 h-3" /> תקלה
                 </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
            {site.cleaning_recommended && (
                <Button variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 gap-2">
                    <Droplets className="w-4 h-4" /> דורש ניקוי
                </Button>
            )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white p-1 border border-slate-200 h-11 w-full justify-start rounded-xl">
          <TabsTrigger 
            value="overview" 
            className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600 text-slate-500 gap-2 px-6 rounded-lg h-9"
          >
            <Wrench className="w-4 h-4" />
            סקירה כללית
          </TabsTrigger>
          <TabsTrigger 
            value="analysis" 
            className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600 text-slate-500 gap-2 px-6 rounded-lg h-9"
          >
            <BarChart3 className="w-4 h-4" />
            ניתוח ייצור
          </TabsTrigger>
          <TabsTrigger 
            value="config" 
            className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600 text-slate-500 gap-2 px-6 rounded-lg h-9"
          >
            <SettingsIcon className="w-4 h-4" />
            הגדרות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
               {/* Main Chart Card */}
               <Card className="p-6 border border-slate-200 shadow-sm bg-white">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-slate-800">ייצור יומי</h3>
                    <div className="text-sm text-slate-500">
                       סך הכל: <span className="font-bold text-slate-800">{site.daily_yield_kwh?.toFixed(0)} kWh</span>
                    </div>
                 </div>
                 <div className="h-72">
                   <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={hourlyData}>
                       <XAxis 
                         dataKey="hour" 
                         tick={{ fill: '#64748b', fontSize: 11 }}
                         stroke="#e2e8f0"
                         axisLine={false}
                         tickLine={false}
                       />
                       <YAxis 
                         tick={{ fill: '#64748b', fontSize: 11 }}
                         stroke="#e2e8f0"
                         axisLine={false}
                         tickLine={false}
                         label={{ value: 'kW', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                       />
                       <Tooltip
                         contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                         labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                         itemStyle={{ color: '#f97316' }}
                         formatter={(value) => [`${value} kW`, 'הספק']}
                       />
                       <Line 
                         type="monotone" 
                         dataKey="power" 
                         stroke="#f97316" 
                         strokeWidth={2}
                         dot={false}
                         activeDot={{ r: 6, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
                       />
                     </LineChart>
                   </ResponsiveContainer>
                 </div>
               </Card>
               
               {/* Tech Specs */}
               <Card className="p-6 border border-slate-200 shadow-sm bg-white">
                 <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                   <Wrench className="w-5 h-5 text-slate-400" />
                   מפרט טכני
                 </h3>
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-8 text-sm">
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
                         <div className="text-slate-500 mb-1">{item.l}</div>
                         <div className="font-medium text-slate-800">{item.v}</div>
                      </div>
                   ))}
                 </div>
               </Card>
            </div>
            
            <div className="space-y-6">
                {/* KPI Cards */}
               <div className="grid grid-cols-1 gap-4">
                 <Card className="p-5 border border-slate-200 shadow-sm bg-white flex items-center justify-between">
                   <div>
                      <div className="text-slate-500 text-xs font-medium uppercase mb-1">תפוקה יומית</div>
                      <div className="text-2xl font-bold text-slate-800">{site.daily_yield_kwh?.toFixed(0)} kWh</div>
                      <div className="text-xs text-emerald-600 mt-1">₪{((site.daily_yield_kwh || 0) * (site.tariff_per_kwh || 0)).toFixed(0)} הכנסות</div>
                   </div>
                   <div className="p-3 bg-orange-50 rounded-full">
                      <Sun className="w-6 h-6 text-orange-500" />
                   </div>
                 </Card>

                 <Card className="p-5 border border-slate-200 shadow-sm bg-white flex items-center justify-between">
                   <div>
                      <div className="text-slate-500 text-xs font-medium uppercase mb-1">תפוקה שנתית</div>
                      <div className="text-2xl font-bold text-slate-800">{(site.yearly_yield_kwh / 1000)?.toFixed(1)} MWh</div>
                      <div className="text-xs text-slate-400 mt-1">{site.dc_capacity_kwp > 0 ? (site.yearly_yield_kwh / site.dc_capacity_kwp).toFixed(0) : 0} kWh/kWp</div>
                   </div>
                   <div className="p-3 bg-blue-50 rounded-full">
                      <Zap className="w-6 h-6 text-blue-500" />
                   </div>
                 </Card>

                 <Card className="p-5 border border-slate-200 shadow-sm bg-white flex items-center justify-between">
                   <div>
                      <div className="text-slate-500 text-xs font-medium uppercase mb-1">ROI מצטבר</div>
                      <div className="text-2xl font-bold text-slate-800">{roi}%</div>
                      <div className="text-xs text-slate-400 mt-1">₪{totalRevenue.toFixed(0)} / ₪{site.initial_investment?.toFixed(0) || 0}</div>
                   </div>
                   <div className="p-3 bg-emerald-50 rounded-full">
                      <BarChart3 className="w-6 h-6 text-emerald-500" />
                   </div>
                 </Card>
               </div>

               {/* Maintenance Card */}
               <Card className="p-6 border border-slate-200 shadow-sm bg-white">
                 <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                   <Calendar className="w-5 h-5 text-slate-400" />
                   תחזוקה
                 </h3>
                 <div className="space-y-4 text-sm border-l-2 border-slate-100 pl-4 ml-1">
                   <div>
                     <div className="text-slate-500 text-xs mb-0.5">ניקוי אחרון</div>
                     <div className="font-medium text-slate-800">
                       {site.last_cleaning_date ? new Date(site.last_cleaning_date).toLocaleDateString('he-IL') : 'אין נתונים'}
                     </div>
                   </div>
                   <div>
                     <div className="text-slate-500 text-xs mb-0.5">מרווח ניקוי מומלץ</div>
                     <div className="font-medium text-slate-800">{site.cleaning_interval_days} ימים</div>
                   </div>
                   <div>
                     <div className="text-slate-500 text-xs mb-0.5">תאריך התקנה</div>
                     <div className="font-medium text-slate-800">
                       {site.installation_date ? new Date(site.installation_date).toLocaleDateString('he-IL') : 'אין נתונים'}
                     </div>
                   </div>
                 </div>
               </Card>
            </div>
          </div>

          {/* Inverters Section */}
          <div className="mt-8">
             <h2 className="text-xl font-bold text-slate-800 mb-4">ממירים ומערכת חשמל</h2>
             {inverters.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400">
                   אין ממירים מוגדרים לאתר זה
                </div>
             ) : (
                <div className="grid grid-cols-1 gap-6">
                   {inverters.map(inverter => (
                      <Card key={inverter.id} className="p-6 border border-slate-200 shadow-sm bg-white">
                         <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                            <div className="flex items-center gap-3">
                               <div className="p-2 bg-slate-100 rounded-lg">
                                  <Zap className="w-5 h-5 text-slate-500" />
                               </div>
                               <div>
                                  <h3 className="font-bold text-slate-800">{inverter.name}</h3>
                                  <p className="text-xs text-slate-500">{inverter.model}</p>
                               </div>
                            </div>
                            <Badge className={`${inverter.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} border-0`}>
                               {inverter.status === 'online' ? 'מקוון' : 'תקלה'}
                            </Badge>
                         </div>
                         
                         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2">
                               <MPPTTable mpptStrings={inverter.mppt_strings} />
                            </div>
                            <div className="flex items-center justify-center bg-slate-50 rounded-xl p-4">
                               <EfficiencyGauge efficiency={inverter.efficiency_percent} />
                            </div>
                         </div>
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                             <MPPTChart mpptStrings={inverter.mppt_strings} />
                             <StringVoltageChart mpptStrings={inverter.mppt_strings} />
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