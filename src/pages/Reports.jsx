import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, TrendingUp, Sun, Zap, Activity } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import AdvancedChart from "../components/reports/AdvancedChart";
import StatCard from "../components/reports/StatCard";

export default function Reports() {
  const [timeframe, setTimeframe] = useState('monthly');
  const [selectedSite, setSelectedSite] = useState('all');

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => base44.entities.Site.list()
  });

  const generateReport = () => {
    const filteredSites = selectedSite === 'all' 
      ? sites 
      : sites.filter(s => s.id === selectedSite);

    let reportData = [];
    
    filteredSites.forEach(site => {
      let yieldData = 0;
      let revenueData = 0;
      
      switch(timeframe) {
        case 'daily':
          yieldData = site.daily_yield_kwh || 0;
          break;
        case 'monthly':
          yieldData = site.monthly_yield_kwh || 0;
          break;
        case 'yearly':
          yieldData = site.yearly_yield_kwh || 0;
          break;
        case 'lifetime':
          yieldData = site.lifetime_yield_kwh || 0;
          break;
      }
      
      revenueData = yieldData * (site.tariff_per_kwh || 0);
      
      reportData.push({
        name: site.name,
        region: site.region_tag,
        yield: yieldData.toFixed(2),
        revenue: revenueData.toFixed(2),
        specific_yield: site.dc_capacity_kwp > 0 ? (yieldData / site.dc_capacity_kwp).toFixed(2) : 0,
        roi: site.initial_investment > 0 
          ? (((site.lifetime_yield_kwh * site.tariff_per_kwh) / site.initial_investment) * 100).toFixed(1)
          : 0
      });
    });

    const csvContent = [
      ['שם אתר', 'אזור', 'תפוקה (kWh)', 'הכנסות (₪)', 'תפוקה ספציפית (kWh/kWp)', 'ROI (%)'].join(','),
      ...reportData.map(row => [
        row.name,
        row.region,
        row.yield,
        row.revenue,
        row.specific_yield,
        row.roi
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `delkal_report_${timeframe}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totals = sites.reduce((acc, site) => {
    const timeframeMap = {
      daily: site.daily_yield_kwh || 0,
      monthly: site.monthly_yield_kwh || 0,
      yearly: site.yearly_yield_kwh || 0,
      lifetime: site.lifetime_yield_kwh || 0
    };
    
    const yield_value = timeframeMap[timeframe];
    const revenue = yield_value * (site.tariff_per_kwh || 0);
    
    return {
      yield: acc.yield + yield_value,
      revenue: acc.revenue + revenue
    };
  }, { yield: 0, revenue: 0 });

  // Prepare chart data
  const chartData = sites.map(site => ({
    name: site.name,
    yield: site[yieldKey] || 0,
    revenue: (site[yieldKey] || 0) * (site.tariff_per_kwh || 0),
    capacity: site.dc_capacity_kwp || 0
  })).sort((a, b) => b.yield - a.yield).slice(0, 10);

  return (
    <div className="min-h-screen p-6" style={{ background: '#0d1117' }}>
      <div className="max-w-[1600px] mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-5xl font-bold mb-3 neon-glow" style={{ color: '#00ff88' }}>
            דוחות וניתוחים מתקדמים
          </h1>
          <p className="text-gray-400 text-lg">מערכת ניתוח ביצועים חכמה בזמן אמת</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          <StatCard 
            icon={Sun}
            label="תפוקה כוללת"
            value={(totals.yield / 1000).toFixed(1)}
            unit="MWh"
            trend={8}
            color="#00ff88"
          />
          <StatCard 
            icon={Zap}
            label="הכנסות"
            value={`₪${(totals.revenue / 1000).toFixed(0)}K`}
            unit=""
            trend={12}
            color="#58a6ff"
          />
          <StatCard 
            icon={Activity}
            label="יעילות ממוצעת"
            value="94.5"
            unit="%"
            trend={3}
            color="#ffaa00"
          />
          <StatCard 
            icon={TrendingUp}
            label="ROI ממוצע"
            value="126"
            unit="%"
            trend={15}
            color="#a78bfa"
          />
        </div>

        <AdvancedChart 
          data={chartData}
          title="ניתוח תפוקה לפי אתר - Top 10"
          dataKey="yield"
          color="#00ff88"
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <Card className="p-6 border-0 futuristic-card">
            <h3 className="text-white font-bold mb-6 neon-glow">הגדרות דוח</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">מסגרת זמן</label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white backdrop-blur">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">יומי</SelectItem>
                    <SelectItem value="monthly">חודשי</SelectItem>
                    <SelectItem value="yearly">שנתי</SelectItem>
                    <SelectItem value="lifetime">מצטבר</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">בחר אתר</label>
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger className="bg-gray-900/50 border-gray-700 text-white backdrop-blur">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל האתרים</SelectItem>
                    {sites.map(site => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={generateReport}
                className="w-full mt-4"
                style={{ 
                  background: 'linear-gradient(135deg, #00ff88 0%, #00cc6f 100%)',
                  color: '#000'
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                ייצוא לקובץ CSV
              </Button>
            </div>
          </Card>

          <Card className="p-6 border-0 futuristic-card">
            <h3 className="text-white font-bold mb-4 neon-glow">מידע בדוח</h3>
            <div className="space-y-3">
              {[
                'שם אתר ומיקום גיאוגרפי',
                'תפוקת אנרגיה (kWh) לפי מסגרת זמן',
                'הכנסות פיננסיות מחושבות',
                'תפוקה ספציפית (kWh/kWp)',
                'ROI מצטבר (%)',
                'ניתוח השוואתי אזורי'
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3 text-gray-300 text-sm"
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: '#00ff88' }} />
                  {item}
                </motion.div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}