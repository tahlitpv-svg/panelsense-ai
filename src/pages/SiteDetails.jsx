import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowRight, MapPin, Wrench, Calendar, BarChart3, Settings as SettingsIcon } from "lucide-react";
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d1117' }}>
        <div className="text-gray-400">טוען נתוני אתר...</div>
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
    <div className="min-h-screen p-6" style={{ background: '#0d1117' }}>
      <div className="max-w-[1800px] mx-auto">
        <div className="mb-6">
          <Link to={createPageUrl('Dashboard')}>
            <Button variant="ghost" className="gap-2 text-gray-400 hover:text-white">
              <ArrowRight className="w-4 h-4" />
              חזרה לדאשבורד
            </Button>
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-white">{site.name}</h1>
          <div className="flex items-center gap-4 text-gray-400">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span>{site.region_tag}</span>
            </div>
            <Badge className="bg-blue-500/20 text-blue-400 border-0">
              {site.owner === 'delkal_energy' ? 'אתר דלקל' : 'לקוח חיצוני'}
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="bg-[#1a1f2e] border border-[#00ff8840] p-1">
            <TabsTrigger 
              value="overview" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00ff8820] data-[state=active]:to-[#00ccff20] data-[state=active]:text-[#00ff88] gap-2"
            >
              <Wrench className="w-4 h-4" />
              סקירה כללית
            </TabsTrigger>
            <TabsTrigger 
              value="analysis" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00ff8820] data-[state=active]:to-[#00ccff20] data-[state=active]:text-[#00ff88] gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              ניתוח ייצור
            </TabsTrigger>
            <TabsTrigger 
              value="config" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#00ff8820] data-[state=active]:to-[#00ccff20] data-[state=active]:text-[#00ff88] gap-2"
            >
              <SettingsIcon className="w-4 h-4" />
              הגדרות
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
        <Card className="p-6 border-0 mb-8 futuristic-card">
          <h3 className="text-white font-bold mb-4">ייצור יומי</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData}>
                <XAxis 
                  dataKey="hour" 
                  tick={{ fill: '#8b949e', fontSize: 11 }}
                  stroke="#30363d"
                />
                <YAxis 
                  tick={{ fill: '#8b949e', fontSize: 11 }}
                  stroke="#30363d"
                  label={{ value: 'kW', angle: -90, position: 'insideLeft', fill: '#8b949e' }}
                />
                <Tooltip
                  contentStyle={{ background: '#1a1f2e', border: '1px solid #30363d', borderRadius: '8px' }}
                  labelStyle={{ color: '#e6edf3' }}
                  itemStyle={{ color: '#00ff88' }}
                  formatter={(value) => [`${value} kW`, 'הספק']}
                />
                <Line 
                  type="monotone" 
                  dataKey="power" 
                  stroke="#00ff88" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, fill: '#00ff88' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
            <div className="text-gray-400 text-sm mb-2">תפוקה יומית</div>
            <div className="text-3xl font-bold text-white mb-1">
              {site.daily_yield_kwh?.toFixed(0) || 0} kWh
            </div>
            <div className="text-sm" style={{ color: '#00ff88' }}>
              ₪{((site.daily_yield_kwh || 0) * (site.tariff_per_kwh || 0)).toFixed(0)} הכנסות
            </div>
          </Card>

          <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
            <div className="text-gray-400 text-sm mb-2">תפוקה שנתית</div>
            <div className="text-3xl font-bold text-white mb-1">
              {(site.yearly_yield_kwh / 1000)?.toFixed(1) || 0} MWh
            </div>
            <div className="text-sm text-gray-400">
              {site.dc_capacity_kwp > 0 ? (site.yearly_yield_kwh / site.dc_capacity_kwp).toFixed(0) : 0} kWh/kWp
            </div>
          </Card>

          <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
            <div className="text-gray-400 text-sm mb-2">ROI מצטבר</div>
            <div className="text-3xl font-bold mb-1" style={{ color: roi > 100 ? '#00ff88' : '#ffaa00' }}>
              {roi}%
            </div>
            <div className="text-sm text-gray-400">
              ₪{totalRevenue.toFixed(0)} / ₪{site.initial_investment?.toFixed(0) || 0}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Wrench className="w-5 h-5" style={{ color: '#00ff88' }} />
              מפרט טכני
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">הספק DC</span>
                <span className="text-white font-medium">{site.dc_capacity_kwp} kWp</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">הספק AC</span>
                <span className="text-white font-medium">{site.ac_capacity_kw} kW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">סוג ממירים</span>
                <span className="text-white font-medium">{site.inverter_type || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">סוג פאנלים</span>
                <span className="text-white font-medium">{site.panel_type || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">אזימוט</span>
                <span className="text-white font-medium">{site.azimuth_deg}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">זווית הטיה</span>
                <span className="text-white font-medium">{site.tilt_deg}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">סוג התקנה</span>
                <span className="text-white font-medium">
                  {site.mounting_type === 'roof' ? 'גג' : site.mounting_type === 'ground' ? 'קרקע' : 'עוקב'}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" style={{ color: '#00ff88' }} />
              תחזוקה
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">ניקוי אחרון</span>
                <span className="text-white font-medium">
                  {site.last_cleaning_date ? new Date(site.last_cleaning_date).toLocaleDateString('he-IL') : 'אין נתונים'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">מרווח ניקוי</span>
                <span className="text-white font-medium">{site.cleaning_interval_days} ימים</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">תאריך התקנה</span>
                <span className="text-white font-medium">
                  {site.installation_date ? new Date(site.installation_date).toLocaleDateString('he-IL') : 'אין נתונים'}
                </span>
              </div>
              {site.cleaning_recommended && (
                <div className="mt-4 p-3 rounded-lg" style={{ background: '#ffaa0020', border: '1px solid #ffaa00' }}>
                  <div className="text-amber-400 font-medium text-center">
                    מומלץ לבצע ניקוי
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
            <h3 className="text-white font-bold mb-4">סטטיסטיקות מצטברות</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">תפוקה חודשית</span>
                <span className="text-white font-medium">{(site.monthly_yield_kwh / 1000).toFixed(1)} MWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">תפוקה כוללת</span>
                <span className="text-white font-medium">{(site.lifetime_yield_kwh / 1000).toFixed(1)} MWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">תעריף</span>
                <span className="text-white font-medium">₪{site.tariff_per_kwh?.toFixed(2)}/kWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">הכנסות כוללות</span>
                <span style={{ color: '#00ff88' }} className="font-medium">₪{totalRevenue.toFixed(0)}</span>
              </div>
            </div>
          </Card>
        </div>

        <h2 className="text-2xl font-bold text-white mb-4">ממירים ואנליזת MPPT</h2>
        <div className="grid grid-cols-1 gap-6">
          {inverters.length === 0 ? (
            <Card className="p-12 border-0 text-center" style={{ background: '#1a1f2e' }}>
              <p className="text-gray-400">אין ממירים מוגדרים לאתר זה</p>
            </Card>
          ) : (
            inverters.map(inverter => (
              <Card key={inverter.id} className="p-6 border-0" style={{ background: '#1a1f2e' }}>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">{inverter.name}</h3>
                    <p className="text-sm text-gray-400">{inverter.model}</p>
                  </div>
                  <Badge 
                    className="border-0"
                    style={{
                      background: inverter.status === 'online' ? '#00ff8820' : '#ff333320',
                      color: inverter.status === 'online' ? '#00ff88' : '#ff3333'
                    }}
                  >
                    {inverter.status === 'online' ? 'מקוון' : 'לא מקוון'}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                  <div>
                    <div className="text-gray-400 text-sm mb-1">הספק AC נוכחי</div>
                    <div className="text-2xl font-bold text-white">{inverter.current_ac_power_kw?.toFixed(2)} kW</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm mb-1">הספק DC נוכחי</div>
                    <div className="text-2xl font-bold text-white">{inverter.current_dc_power_kw?.toFixed(2)} kW</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm mb-1">טמפרטורה</div>
                    <div className="text-2xl font-bold text-white">{inverter.temperature_c || 0}°C</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <h4 className="text-white font-bold mb-3">מחרוזות MPPT</h4>
                      <MPPTTable mpptStrings={inverter.mppt_strings} />
                    </div>
                    <div>
                      <EfficiencyGauge efficiency={inverter.efficiency_percent} />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <MPPTChart mpptStrings={inverter.mppt_strings} />
                    <StringVoltageChart mpptStrings={inverter.mppt_strings} />
                  </div>
                </div>
              </Card>
            ))
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
    </div>
  );
}