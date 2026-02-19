import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, TrendingUp } from "lucide-react";
import { format } from "date-fns";

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

  return (
    <div className="min-h-screen p-6" style={{ background: '#0d1117' }}>
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2" style={{ color: '#00ff88' }}>
            דוחות וניתוחים
          </h1>
          <p className="text-gray-400">יצירת דוחות ביצועים פיננסיים</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg" style={{ background: '#00ff8820' }}>
                <TrendingUp className="w-5 h-5" style={{ color: '#00ff88' }} />
              </div>
              <h3 className="text-white font-bold">תפוקה כוללת</h3>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {(totals.yield / 1000).toFixed(1)} MWh
            </div>
            <div className="text-sm text-gray-400">
              {timeframe === 'daily' ? 'היום' : timeframe === 'monthly' ? 'החודש' : timeframe === 'yearly' ? 'השנה' : 'מצטבר'}
            </div>
          </Card>

          <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg" style={{ background: '#00ff8820' }}>
                <FileText className="w-5 h-5" style={{ color: '#00ff88' }} />
              </div>
              <h3 className="text-white font-bold">הכנסות כוללות</h3>
            </div>
            <div className="text-3xl font-bold mb-1" style={{ color: '#00ff88' }}>
              ₪{totals.revenue.toFixed(0)}
            </div>
            <div className="text-sm text-gray-400">
              {timeframe === 'daily' ? 'היום' : timeframe === 'monthly' ? 'החודש' : timeframe === 'yearly' ? 'השנה' : 'מצטבר'}
            </div>
          </Card>

          <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg" style={{ background: '#00ff8820' }}>
                <Download className="w-5 h-5" style={{ color: '#00ff88' }} />
              </div>
              <h3 className="text-white font-bold">ייצוא דוח</h3>
            </div>
            <Button 
              onClick={generateReport}
              className="w-full"
              style={{ 
                background: 'linear-gradient(135deg, #00ff88 0%, #00cc6f 100%)',
                color: '#000'
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              הורד CSV
            </Button>
          </Card>
        </div>

        <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
          <h3 className="text-white font-bold mb-6">הגדרות דוח</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-gray-400 text-sm mb-2 block">מסגרת זמן</label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
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
                <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
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
          </div>
        </Card>

        <Card className="mt-6 p-6 border-0" style={{ background: '#1a1f2e' }}>
          <h3 className="text-white font-bold mb-4">מידע כלול בדוח</h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>✓ שם אתר ומיקום גיאוגרפי</li>
            <li>✓ תפוקת אנרגיה (kWh) לפי מסגרת זמן</li>
            <li>✓ הכנסות פיננסיות (₪) מחושבות לפי תעריף</li>
            <li>✓ תפוקה ספציפית (kWh/kWp)</li>
            <li>✓ ROI מצטבר (%)</li>
            <li>✓ פורמט CSV לפתיחה ב-Excel</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}