import React, { useState, useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { format, subDays, subMonths, subYears, getDaysInMonth } from "date-fns";

export default function SiteProductionChart({ stationId }) {
  const [timeframe, setTimeframe] = useState('today');
  // offset: 0 = current, -1 = one back, etc.
  const [offset, setOffset] = useState(0);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Reset offset when timeframe changes
  const handleTimeframeChange = (tf) => {
    setTimeframe(tf);
    setOffset(0);
  };

  // Compute the reference date based on timeframe + offset
  const getRefDate = () => {
    const now = new Date();
    if (timeframe === 'today' || timeframe === 'yesterday') {
      // For day mode, offset shifts days (yesterday is offset -1 from today)
      const base = timeframe === 'yesterday' ? subDays(now, 1) : now;
      return subDays(base, -offset); // offset is 0 or negative
    }
    if (timeframe === 'month') return subMonths(now, -offset);
    if (timeframe === 'year') return subYears(now, -offset);
    return now;
  };

  const refDate = getRefDate();

  // Label for the navigation
  const getPeriodLabel = () => {
    if (timeframe === 'today' || timeframe === 'yesterday') {
      return format(refDate, 'dd/MM/yyyy');
    }
    if (timeframe === 'month') return format(refDate, 'MM/yyyy');
    if (timeframe === 'year') return format(refDate, 'yyyy');
    return '';
  };

  const isDay = timeframe === 'today' || timeframe === 'yesterday';
  const color = isDay ? "#f97316" : "#3b82f6";
  const canGoForward = offset < 0;

  const timeToMinutes = (t) => {
    const [h, m] = (t || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const minutesToTime = (mins) => {
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    return `${h}:${m}`;
  };
  const dayTickValues = [5 * 60, 12 * 60, 20 * 60];

  const queryKey = ['stationGraph', stationId, timeframe, offset];

  const { data: chartData, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!stationId) return [];

      // Daily (today/yesterday) — read from DB snapshots (no live pull)
      if (isDay) {
        const dateKey = format(refDate, 'yyyy-MM-dd');
        const snaps = await base44.entities.SiteGraphSnapshot.filter({ station_id: stationId, date_key: dateKey });
        const raw = snaps?.[0]?.data || [];
        const mapped = raw
          .filter(d => d.time && d.time !== '')
          .map((d) => ({ label: d.time, minutes: timeToMinutes(d.time), value: d.value }));
        mapped.sort((a, b) => a.minutes - b.minutes);
        return mapped;
      }

      // Month / Year — keep using live pull
      let endpoint = '';
      let body = { id: stationId, timezone: 2 };

      if (timeframe === 'month') {
        endpoint = '/v1/api/stationMonth';
        body.month = format(refDate, 'yyyy-MM');
      } else if (timeframe === 'year') {
        endpoint = '/v1/api/stationYear';
        body.year = format(refDate, 'yyyy');
      }

      const res = await base44.functions.invoke('getSolisGraphData', { endpoint, body });
      if (!res.data?.success || !res.data?.data) return [];
      const raw = res.data.data;

      if (timeframe === 'month') {
        const daysInMonth = getDaysInMonth(refDate);
        const byDay = {};
        raw.forEach(item => {
          const parts = (item.dateStr || '').split('-');
          const day = parts.length > 2 ? parseInt(parts[2], 10) : null;
          if (day) byDay[day] = parseFloat(item.energy) || 0;
        });
        return Array.from({ length: daysInMonth }, (_, i) => ({
          label: String(i + 1).padStart(2, '0'),
          value: byDay[i + 1] || 0
        }));
      }

      if (timeframe === 'year') {
        const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
        const byMonth = {};
        raw.forEach(item => {
          const parts = (item.dateStr || '').split('-');
          const m = parts.length > 1 ? parts[1] : null;
          if (m) {
            let energy = parseFloat(item.energy) || 0;
            if (item.energyStr === 'MWh') energy = energy * 1000;
            byMonth[m] = energy;
          }
        });
        return months.map(m => ({ label: m, value: byMonth[m] || 0 }));
      }

      return [];
    },
    enabled: !!stationId
  });

  const yUnit = isDay ? 'kW' : 'kWh';
  const barSize = vw < 380 ? 8 : vw < 480 ? 10 : 12;
  const chartTitle = isDay
    ? `ייצור יומי - הספק (kW)`
    : timeframe === 'month'
      ? `ייצור חודשי (kWh)`
      : `ייצור שנתי (kWh)`;

  return (
    <Card className="p-6 border border-slate-200 shadow-sm bg-white">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
        <h3 className="text-lg font-bold text-slate-800" dir="rtl">{chartTitle}</h3>

        <Tabs value={timeframe} onValueChange={handleTimeframeChange}>
          <TabsList className="bg-slate-100 p-1">
            <TabsTrigger value="today" className="text-sm px-4">היום</TabsTrigger>
            <TabsTrigger value="yesterday" className="text-sm px-4">אתמול</TabsTrigger>
            <TabsTrigger value="month" className="text-sm px-4">חודש</TabsTrigger>
            <TabsTrigger value="year" className="text-sm px-4">שנה</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Period navigation — only for month and year (day handled via today/yesterday tabs + back) */}
      {(timeframe === 'month' || timeframe === 'year' || isDay) && (
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setOffset(o => o - 1)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[100px] text-center">{getPeriodLabel()}</span>
          <button
            onClick={() => setOffset(o => o + 1)}
            disabled={!canGoForward}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="h-72" dir="ltr">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            <div>מושך נתונים...</div>
          </div>
        ) : !chartData || chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 border border-dashed rounded-xl">
            אין נתונים לתקופה זו
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {isDay ? (
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 14 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="minutes" type="number" domain={[5 * 60, 20 * 60]} ticks={dayTickValues}
                  tickFormatter={minutesToTime} tick={{ fill: '#64748b', fontSize: 11, textAnchor: 'middle' }}
                  axisLine={false} tickLine={false} tickMargin={12} allowDataOverflow={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                  domain={[0, 'auto']}
                  label={{ value: 'kW', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                  formatter={(value) => [`${value} kW`, 'הספק']}
                />
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false}
                  connectNulls
                  activeDot={{ r: 6, fill: color, stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 14 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11, textAnchor: 'middle' }} axisLine={false} tickLine={false} padding={{ left: 20, right: 20 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                  domain={[0, 'auto']}
                  label={{ value: yUnit, angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                  cursor={{ fill: 'rgba(59,130,246,0.05)' }}
                  formatter={(value) => [`${value?.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${yUnit}`, 'תפוקה']}
                />
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]}
                  barSize={timeframe === 'month' ? barSize : 28} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}