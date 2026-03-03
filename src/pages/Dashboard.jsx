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
    <div className="space-y-6" style={{ color: '#e2e8f0' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">סקירה כללית</h1>
          <p className="text-slate-400 text-sm mt-0.5">תמונת מצב יומית של צי האנרגיה</p>
        </div>
        <Button
          onClick={() => refetch()}
          size="sm"
          className="gap-2 text-green-400 border-green-500/30 hover:bg-green-500/10"
          style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)' }}
        >
          <RefreshCw className="w-4 h-4" />
          רענן נתונים
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="תפוקה יומית כוללת"
          value={totalDailyYield.toFixed(0)}
          unit="kWh"
          icon={Zap}
          color="#4ade80"
        />
        <KPICard
          title="הכנסות הצי היום"
          value={`₪${totalRevenue.toFixed(0)}`}
          unit=""
          icon={DollarSign}
          color="#4ade80"
        />
        <KPICard
          title="תקינות הצי"
          value={healthRatio.toFixed(0)}
          unit="%"
          icon={Activity}
          color={healthRatio >= 90 ? '#4ade80' : healthRatio >= 70 ? '#fbbf24' : '#f87171'}
        />
        <KPICard
          title="הספק פעיל"
          value={(totalPower / 1000).toFixed(2)}
          unit="MW"
          icon={TrendingUp}
          color="#60a5fa"
        />
      </div>

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded-xl"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRight: '3px solid #f87171' }}>
          <div>
            <div className="text-red-400 font-bold mb-1 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4" />
              {alerts.length} התראות פעילות
            </div>
            <div className="text-xs text-red-400/70">
              {alerts.slice(0, 2).map(a => a.message).join(' • ')}
            </div>
          </div>
          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs">
            לטיפול
          </Button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="inline-flex p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="bg-transparent gap-1 h-8 p-0">
            {[
              { v: 'all', l: 'כל האתרים' },
              { v: 'delkal', l: 'אתרי דלקל' },
              { v: 'external', l: 'לקוחות חיצוניים' },
              { v: 'faulty', l: 'תקלות' }
            ].map(tab => (
              <TabsTrigger key={tab.v} value={tab.v}
                className="text-slate-400 rounded-lg px-4 h-8 text-xs font-medium shadow-none data-[state=active]:text-green-400 data-[state=active]:shadow-none"
                style={{ '--tw-ring-shadow': 'none' }}
                data-custom="true"
              >
                {tab.l}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Energy Chart */}
          <div className="rounded-2xl p-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #161c26, #1a2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-white">ייצור אנרגיה</h2>
              <Tabs value={chartTimeframe} onValueChange={setChartTimeframe}>
                <TabsList className="h-7 p-0.5 gap-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  {[{ v: 'hourly', l: 'שעתי' }, { v: 'daily', l: 'יומי' }, { v: 'monthly', l: 'חודשי' }].map(t => (
                    <TabsTrigger key={t.v} value={t.v} className="h-6 text-xs px-3 rounded-md text-slate-400 data-[state=active]:text-green-400 data-[state=active]:shadow-none shadow-none">{t.l}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <FleetProductionChart sites={filteredSites} timeframe={chartTimeframe} />
          </div>

          {/* Map */}
          <div className="rounded-2xl overflow-hidden h-[380px] relative"
            style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
            <FleetMap sites={filteredSites} />
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Regional chart */}
          <div className="rounded-2xl p-5"
            style={{ background: 'linear-gradient(135deg, #161c26, #1a2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h2 className="text-base font-bold text-white mb-4">התפלגות גיאוגרפית</h2>
            <FleetOverviewChart sites={filteredSites} />
          </div>

          {/* Site list */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-base font-bold text-white">רשימת אתרים</h2>
              <span className="text-xs text-green-400/70 px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
                {filteredSites.length} אתרים
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 max-h-[620px] overflow-y-auto pl-1">
              {filteredSites.length === 0 ? (
                <div className="text-center text-slate-500 py-12 rounded-xl text-sm"
                  style={{ border: '1px dashed rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
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