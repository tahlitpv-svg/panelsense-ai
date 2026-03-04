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
    <div className="space-y-4 md:space-y-6 text-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">סקירה כללית</h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">תמונת מצב יומית של צי האנרגיה</p>
        </div>
        <Button
          onClick={() => refetch()}
          size="sm"
          variant="outline"
          className="gap-2 text-green-700 border-green-200 bg-green-50 hover:bg-green-100 hover:text-green-800 text-xs md:text-sm"
        >
          <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4" />
          <span className="hidden sm:inline">רענן נתונים</span>
          <span className="sm:hidden">רענן</span>
        </Button>
      </div>

      {/* KPI Cards - 2 cols on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KPICard title="תפוקה יומית" value={totalDailyYield.toFixed(0)} unit="kWh" icon={Zap} color="#16a34a" />
        <KPICard title="הכנסות היום" value={`₪${totalRevenue.toFixed(0)}`} unit="" icon={DollarSign} color="#16a34a" />
        <KPICard title="תקינות" value={healthRatio.toFixed(0)} unit="%" icon={Activity}
          color={healthRatio >= 90 ? '#16a34a' : healthRatio >= 70 ? '#d97706' : '#dc2626'} />
        <KPICard title="הספק פעיל" value={(totalPower / 1000).toFixed(2)} unit="MW" icon={TrendingUp} color="#2563eb" />
      </div>

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div className="flex items-center justify-between p-3 md:p-4 rounded-xl bg-red-50 border border-red-200 border-r-4 border-r-red-500">
          <div>
            <div className="text-red-700 font-bold mb-0.5 flex items-center gap-2 text-xs md:text-sm">
              <AlertTriangle className="w-3.5 h-3.5" />
              {alerts.length} התראות פעילות
            </div>
            <div className="text-xs text-red-600 line-clamp-1">
              {alerts.slice(0, 1).map(a => a.message).join(' • ')}
            </div>
          </div>
          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-100 text-xs shrink-0">
            לטיפול
          </Button>
        </div>
      )}

      {/* Filter Tabs - scrollable on mobile */}
      <div className="overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200 shadow-sm min-w-max">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="bg-transparent gap-1 h-8 p-0">
              {[
                { v: 'all', l: 'הכל' },
                { v: 'delkal', l: 'דלקל' },
                { v: 'external', l: 'חיצוניים' },
                { v: 'faulty', l: 'תקלות' }
              ].map(tab => (
                <TabsTrigger key={tab.v} value={tab.v}
                  className="text-slate-500 rounded-lg px-3 md:px-4 h-8 text-xs font-medium shadow-none data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900"
                >
                  {tab.l}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        <div className="lg:col-span-2 space-y-4 md:space-y-5">

          {/* Energy Chart */}
          <div className="rounded-2xl p-4 md:p-5 bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm md:text-base font-bold text-slate-900">ייצור אנרגיה</h2>
              <Tabs value={chartTimeframe} onValueChange={setChartTimeframe}>
                <TabsList className="h-7 p-0.5 gap-0.5 bg-slate-100">
                  {[{ v: 'hourly', l: 'שעתי' }, { v: 'daily', l: 'יומי' }, { v: 'monthly', l: 'חודשי' }].map(t => (
                    <TabsTrigger key={t.v} value={t.v} className="h-6 text-xs px-2 md:px-3 rounded-md text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm shadow-none">{t.l}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <div style={{ width: '100%', minHeight: 260 }}>
              <FleetProductionChart sites={filteredSites} timeframe={chartTimeframe} />
            </div>
          </div>

          {/* Map - shorter on mobile */}
          <div className="rounded-2xl overflow-hidden h-[260px] md:h-[380px] bg-white border border-slate-200 shadow-sm">
            <FleetMap sites={filteredSites} />
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4 md:space-y-5">
          {/* Regional chart - hidden on mobile to save space, shown on desktop */}
          <div className="hidden lg:block rounded-2xl p-5 bg-white border border-slate-200 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4">התפלגות גיאוגרפית</h2>
            <FleetOverviewChart sites={filteredSites} />
          </div>

          {/* Site list */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-sm md:text-base font-bold text-slate-900">רשימת אתרים</h2>
              <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                {filteredSites.length} אתרים
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 lg:max-h-[620px] lg:overflow-y-auto">
              {filteredSites.length === 0 ? (
                <div className="text-center text-slate-500 py-12 rounded-xl text-sm border border-dashed border-slate-200 bg-slate-50 col-span-full">
                  אין אתרים להצגה
                </div>
              ) : (
                filteredSites.map(site => (
                  <SiteCard key={site.id} site={site} regionalAverage={regionalAverages[site.region_tag] || 1} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}