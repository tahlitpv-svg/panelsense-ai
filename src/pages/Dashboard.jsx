import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Zap, DollarSign, Activity, TrendingUp, RefreshCw, AlertTriangle } from "lucide-react";
import KPICard from "../components/dashboard/KPICard";
import SiteCard from "../components/dashboard/SiteCard";
import FleetMap from "../components/dashboard/FleetMap";
import FleetProductionChart from "../components/dashboard/FleetProductionChart";
import FleetOverviewChart from "../components/dashboard/FleetOverviewChart";

export default function Dashboard() {
  const [filter, setFilter] = useState('all');
  const [chartTimeframe, setChartTimeframe] = useState('hourly');

  const { data: sites = [], isLoading, refetch } = useQuery({
    queryKey: ['sites'],
    queryFn: () => base44.entities.Site.list('-updated_date'),
    refetchInterval: 30000
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => base44.entities.Alert.filter({ is_resolved: false })
  });

  const filteredSites = sites.filter(site => {
    if (filter === 'delkal') return site.owner === 'delkal_energy';
    if (filter === 'external') return site.owner === 'external_client';
    if (filter === 'faulty') return site.status === 'warning' || site.status === 'offline';
    return true;
  });

  const totalDailyYield = sites.reduce((sum, site) => sum + (site.daily_yield_kwh || 0), 0);
  const totalRevenue = sites.reduce((sum, site) => sum + ((site.daily_yield_kwh || 0) * (site.tariff_per_kwh || 0)), 0);
  const onlineSites = sites.filter(s => s.status === 'online').length;
  const healthRatio = sites.length > 0 ? (onlineSites / sites.length * 100) : 100;
  const totalPower = sites.reduce((sum, site) => sum + (site.current_power_kw || 0), 0);

  const regionalAverages = {};
  ['north', 'center', 'south', 'arava'].forEach(region => {
    const regionSites = sites.filter(s => s.region_tag === region && s.dc_capacity_kwp > 0);
    const avgYield = regionSites.length > 0
      ? regionSites.reduce((sum, s) => sum + (s.specific_yield_kwh_kwp || 0), 0) / regionSites.length
      : 0;
    regionalAverages[region] = avgYield;
  });

  return (
  <div className="space-y-6 text-slate-600">
  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-700 metallic-text">
            סקירה כללית
          </h1>
          <p className="text-slate-500 font-medium">תמונת מצב יומית של צי האנרגיה</p>
        </div>
        <Button 
          onClick={() => refetch()}
          variant="outline"
          className="gap-2 bg-white hover:bg-slate-50 border-slate-200 text-slate-600"
        >
          <RefreshCw className="w-4 h-4" />
          רענן נתונים
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="תפוקה יומית כוללת"
          value={totalDailyYield.toFixed(0)}
          unit="kWh"
          icon={Zap}
          color="#f97316"
        />
        <KPICard 
          title="הכנסות הצי היום"
          value={`₪${totalRevenue.toFixed(0)}`}
          unit=""
          icon={DollarSign}
          color="#f97316"
        />
        <KPICard 
          title="תקינות הצי"
          value={healthRatio.toFixed(0)}
          unit="%"
          icon={Activity}
          color={healthRatio >= 90 ? '#10b981' : healthRatio >= 70 ? '#f59e0b' : '#ef4444'}
        />
        <KPICard 
          title="הספק פעיל"
          value={(totalPower / 1000).toFixed(2)}
          unit="MW"
          icon={TrendingUp}
          color="#3b82f6"
        />
      </div>

      {alerts.length > 0 && (
        <div className="bg-red-50 border-r-4 border-red-500 p-4 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-red-800 font-bold mb-1 flex items-center gap-2">
               <AlertTriangle className="w-4 h-4" />
               {alerts.length} התראות פעילות
            </div>
            <div className="text-sm text-red-600">
              {alerts.slice(0, 3).map(alert => alert.message).join(' • ')}
            </div>
          </div>
          <Button variant="ghost" className="text-red-700 hover:text-red-900 hover:bg-red-100" size="sm">
             לטיפול
          </Button>
        </div>
      )}

      <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm inline-flex mb-6">
        <Tabs value={filter} onValueChange={setFilter} className="w-full">
          <TabsList className="bg-transparent p-0 gap-1 h-9">
            <TabsTrigger value="all" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 text-slate-500 rounded-lg px-4 h-full shadow-none">
              כל האתרים
            </TabsTrigger>
            <TabsTrigger value="delkal" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 text-slate-500 rounded-lg px-4 h-full shadow-none">
              אתרי דלקל
            </TabsTrigger>
            <TabsTrigger value="external" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 text-slate-500 rounded-lg px-4 h-full shadow-none">
              לקוחות חיצוניים
            </TabsTrigger>
            <TabsTrigger value="faulty" className="data-[state=active]:bg-red-50 data-[state=active]:text-red-600 text-slate-500 rounded-lg px-4 h-full shadow-none">
              תקלות
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-800">ייצור אנרגיה</h2>
                <Tabs value={chartTimeframe} onValueChange={setChartTimeframe}>
                  <TabsList className="bg-slate-100 h-8">
                    <TabsTrigger value="hourly" className="h-6 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">שעתי</TabsTrigger>
                    <TabsTrigger value="daily" className="h-6 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">יומי</TabsTrigger>
                    <TabsTrigger value="monthly" className="h-6 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">חודשי</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <FleetProductionChart sites={filteredSites} timeframe={chartTimeframe} />
           </div>
           
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-[400px]">
              <FleetMap sites={filteredSites} />
           </div>
        </div>

        <div className="space-y-6">
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4">התפלגות גיאוגרפית</h2>
              <FleetOverviewChart sites={filteredSites} />
           </div>

           <div>
              <div className="flex items-center justify-between mb-4 px-2">
                 <h2 className="text-lg font-bold text-slate-800">רשימת אתרים</h2>
                 <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{filteredSites.length} אתרים</span>
              </div>
              <div className="grid grid-cols-1 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {filteredSites.length === 0 ? (
                  <div className="text-center text-slate-400 py-12 bg-white rounded-xl border border-dashed border-slate-200">
                    אין אתרים להצגה
                  </div>
                ) : (
                  filteredSites.map(site => (
                    <SiteCard 
                      key={site.id} 
                      site={site}
                      regionalAverage={regionalAverages[site.region_tag] || 1}
                    />
                  ))
                )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}