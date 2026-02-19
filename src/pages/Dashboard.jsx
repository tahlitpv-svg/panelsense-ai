import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Zap, DollarSign, Activity, TrendingUp, RefreshCw } from "lucide-react";
import KPICard from "../components/dashboard/KPICard";
import SiteCard from "../components/dashboard/SiteCard";
import FleetMap from "../components/dashboard/FleetMap";

export default function Dashboard() {
  const [filter, setFilter] = useState('all');

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
    <div className="min-h-screen p-6" style={{ background: '#0d1117' }}>
      <div className="max-w-[1800px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="relative">
            <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-[#00ff88] via-[#00ccff] to-[#a78bfa] bg-clip-text text-transparent">
              Delkal Fleet Control Tower
            </h1>
            <div className="absolute -bottom-2 left-0 w-64 h-1 bg-gradient-to-r from-[#00ff88] via-[#00ccff] to-transparent rounded-full" />
            <p className="text-gray-400 mt-3">מערכת ניטור ובקרה לצי מערכות אנרגיה מתחדשת</p>
          </div>
          <Button 
            onClick={() => refetch()}
            className="gap-2"
            style={{ 
              background: 'linear-gradient(135deg, #00ff88 0%, #00cc6f 100%)',
              color: '#000'
            }}
          >
            <RefreshCw className="w-4 h-4" />
            רענן נתונים
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard 
            title="תפוקה יומית כוללת"
            value={totalDailyYield.toFixed(0)}
            unit="kWh"
            icon={Zap}
            color="#00ff88"
          />
          <KPICard 
            title="הכנסות הצי היום"
            value={`₪${totalRevenue.toFixed(0)}`}
            unit=""
            icon={DollarSign}
            color="#00ff88"
          />
          <KPICard 
            title="תקינות הצי"
            value={healthRatio.toFixed(0)}
            unit="%"
            icon={Activity}
            color={healthRatio >= 90 ? '#00ff88' : healthRatio >= 70 ? '#ffaa00' : '#ff3333'}
          />
          <KPICard 
            title="הספק פעיל"
            value={(totalPower / 1000).toFixed(2)}
            unit="MW"
            icon={TrendingUp}
            color="#00ff88"
          />
        </div>

        {alerts.length > 0 && (
          <div className="mb-8 p-4 rounded-lg border-r-4" 
               style={{ 
                 background: '#ff333310',
                 borderColor: '#ff3333'
               }}>
            <div className="text-red-400 font-bold mb-2">
              {alerts.length} התראות פעילות
            </div>
            <div className="text-sm text-gray-300">
              {alerts.slice(0, 3).map(alert => alert.message).join(' • ')}
            </div>
          </div>
        )}

        <Tabs value={filter} onValueChange={setFilter} className="mb-6">
          <TabsList className="bg-gray-900 border-gray-700">
            <TabsTrigger value="all" className="data-[state=active]:bg-gray-700">
              כל האתרים
            </TabsTrigger>
            <TabsTrigger value="delkal" className="data-[state=active]:bg-gray-700">
              אתרי דלקל
            </TabsTrigger>
            <TabsTrigger value="external" className="data-[state=active]:bg-gray-700">
              לקוחות חיצוניים
            </TabsTrigger>
            <TabsTrigger value="faulty" className="data-[state=active]:bg-gray-700">
              תקלות
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <FleetMap sites={filteredSites} />
          </div>
          <div>
            <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-2">
              {filteredSites.length === 0 ? (
                <div className="text-center text-gray-400 py-12">
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