import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart } from "recharts";
import { Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { format, subDays, subMonths, subYears, getDaysInMonth } from "date-fns";

export default function SiteProductionChart({ stationId }) {
  const [timeframe, setTimeframe] = useState('today');
  // offset: 0 = current, -1 = one back, etc.
  const [offset, setOffset] = useState(0);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [showExpected, setShowExpected] = useState(false);

  const { data: siteArray } = useQuery({
    queryKey: ['siteForChart', stationId],
    queryFn: () => base44.entities.Site.filter({ solis_station_id: stationId }),
    enabled: !!stationId
  });
  const site = siteArray?.[0];

  const { data: systemSettingsArr } = useQuery({
    queryKey: ['systemSettingsForChart'],
    queryFn: () => base44.entities.SystemSettings.list()
  });
  const systemSettings = systemSettingsArr?.[0];
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

      // Daily — read from DB snapshots, fallback to live Solis pull
      if (isDay) {
        const dateKey = format(refDate, 'yyyy-MM-dd');
        const snaps = await base44.entities.SiteGraphSnapshot.filter({ station_id: stationId, date_key: dateKey });
        let raw = snaps?.[0]?.data || [];
        const existingSnapshotId = snaps?.[0]?.id || null;

        // Check if snapshot is corrupted (contains empty times from older bug)
        // A healthy snapshot only contains valid time strings like "06:05"
        const hasValidTimes = raw.length > 0 && !raw.some(d => !d.time || d.time === '');

        // If no snapshot or snapshot is corrupt, fetch from Solis
        if (raw.length === 0 || !hasValidTimes) {
          const res = await base44.functions.invoke('getSolisGraphData', {
            endpoint: '/v1/api/stationDay',
            body: { id: stationId, time: dateKey, timezone: 2 }
          });
          const solisRaw = (res.data?.success && Array.isArray(res.data?.data)) ? res.data.data : [];
          raw = solisRaw.map(item => {
            let label = '';
            if (item.timeStr) {
              const ts = item.timeStr.trim();
              const timeMatch = ts.match(/(\d{2}:\d{2})/);
              label = timeMatch ? timeMatch[1] : '';
            }
            const pec = parseFloat(item.powerPec) || 0.001;
            const valueKw = parseFloat(((parseFloat(item.power) || 0) * pec).toFixed(3));
            return { time: label, value: isFinite(valueKw) ? valueKw : 0 };
          }).filter(d => d.time !== '');
          raw.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

          // Save/update to DB for next time (don't await to keep UI fast)
          if (raw.length > 0) {
            if (existingSnapshotId) {
              base44.entities.SiteGraphSnapshot.update(existingSnapshotId, { data: raw }).catch(() => {});
            } else {
              base44.entities.SiteGraphSnapshot.create({ station_id: stationId, date_key: dateKey, data: raw }).catch(() => {});
            }
          }
        }

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

  // Calculate daily total kWh from power curve using trapezoid integration
  const dailyTotalKwh = useMemo(() => {
    if (!isDay || !chartData || chartData.length < 2) return null;
    const validPoints = chartData.filter(d => d.value != null && d.minutes != null).sort((a, b) => a.minutes - b.minutes);
    if (validPoints.length < 2) return null;
    let totalKwh = 0;
    for (let i = 1; i < validPoints.length; i++) {
      const dt = (validPoints[i].minutes - validPoints[i - 1].minutes) / 60; // hours
      const avgPower = (validPoints[i].value + validPoints[i - 1].value) / 2; // kW
      totalKwh += avgPower * dt;
    }
    return totalKwh;
  }, [isDay, chartData]);

  const { expectedAnnualYield, getExpectedMonthlyPercentage } = useMemo(() => {
    let yieldVal = (site?.dc_capacity_kwp || 0) * (site?.annual_kwh_per_kwp || 1650);
    if (site?.string_configs?.length > 0 && systemSettings?.orientation_kwh_per_kwp) {
       let totalDcYield = 0;
       site.string_configs.forEach(s => {
          const kwp = (Number(s.num_panels || 0) * Number(site.panel_watt || 0)) / 1000;
          const kwh_kwp = Number(systemSettings.orientation_kwh_per_kwp[s.orientation || 'south']) || 1650;
          totalDcYield += kwp * kwh_kwp;
       });
       if (totalDcYield > 0) {
          yieldVal = totalDcYield;
       }
    }

    const getExpectedMonthlyPercentage = (monthIndex) => {
      const defaultPercentages = [6, 7, 9, 10, 11, 11, 11, 10, 9, 7, 5, 4];
      if (systemSettings?.monthly_production_percentages) {
         return Number(systemSettings.monthly_production_percentages[monthIndex + 1]) || defaultPercentages[monthIndex];
      }
      return defaultPercentages[monthIndex];
    };
    
    return { expectedAnnualYield: yieldVal, getExpectedMonthlyPercentage };
  }, [site, systemSettings]);

  const expectedDailyYield = useMemo(() => {
    if (!isDay) return null;
    const monthIndex = refDate.getMonth();
    const monthExpected = expectedAnnualYield * (getExpectedMonthlyPercentage(monthIndex) / 100);
    return monthExpected / getDaysInMonth(refDate);
  }, [isDay, refDate, expectedAnnualYield, getExpectedMonthlyPercentage]);

  const chartDataWithExpected = useMemo(() => {
    if (!chartData) return [];

    if (timeframe === 'year') {
      return chartData.map((d, i) => {
        const expectedValue = expectedAnnualYield * (getExpectedMonthlyPercentage(i) / 100);
        return { ...d, expectedValue };
      });
    }

    if (timeframe === 'month') {
      const monthIndex = refDate.getMonth();
      const monthExpected = expectedAnnualYield * (getExpectedMonthlyPercentage(monthIndex) / 100);
      const expectedPerDay = monthExpected / getDaysInMonth(refDate);
      return chartData.map(d => ({ ...d, expectedValue: expectedPerDay }));
    }

    if (isDay) {
      const dayExpected = expectedDailyYield || 0;
      
      // Calculate the theoretical DC peak based on expected daily energy
      const peakKw = dayExpected / 8; // Area of parabola is 8 * peakKw
      
      // Inverter AC capacity acts as a ceiling (clipping) for power export
      const acLimit = site?.ac_capacity_kw || peakKw;

      return chartData.map(d => {
        let expectedValue = 0;
        if (d.minutes) {
          const hours = d.minutes / 60;
          if (hours >= 6 && hours <= 18) {
            expectedValue = peakKw * (1 - Math.pow((hours - 12) / 6, 2));
            if (expectedValue < 0) expectedValue = 0;
            
            // Clip the top of the curve at the AC capacity
            if (expectedValue > acLimit) {
               expectedValue = acLimit;
            }
          }
        }
        return { ...d, expectedValue };
      });
    }

    return chartData;
  }, [chartData, timeframe, isDay, expectedAnnualYield, getExpectedMonthlyPercentage, refDate, expectedDailyYield, site]);

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
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold text-slate-800" dir="rtl">{chartTitle}</h3>
          <label className="flex items-center gap-2 cursor-pointer group bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full shadow-sm transition-all" dir="rtl">
            <Switch id="show-expected" checked={showExpected} onCheckedChange={setShowExpected} className="scale-75 data-[state=checked]:bg-green-500" />
            <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-800">הצג צפי ייצור</span>
          </label>
        </div>

        <Tabs value={timeframe} onValueChange={handleTimeframeChange}>
          <TabsList className="bg-slate-100 p-1">
            <TabsTrigger value="today" className="text-sm px-4">היום</TabsTrigger>
            <TabsTrigger value="yesterday" className="text-sm px-4">אתמול</TabsTrigger>
            <TabsTrigger value="month" className="text-sm px-4">חודש</TabsTrigger>
            <TabsTrigger value="year" className="text-sm px-4">שנה</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Period navigation */}
      {(timeframe === 'month' || timeframe === 'year' || isDay) && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset(o => o - 1)}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-slate-700 min-w-[100px] text-center">{getPeriodLabel()}</span>
            <button
              onClick={() => setOffset(o => o + 1)}
              disabled={!canGoForward}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {isDay && dailyTotalKwh != null && (
            <div className="flex flex-col gap-1.5 items-end">
              <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 shadow-sm">
                <span className="text-xs text-orange-600 font-medium">סה״כ יומי:</span>
                <span className="text-sm font-bold text-orange-700">{dailyTotalKwh.toFixed(1)} kWh</span>
              </div>
              {showExpected && expectedDailyYield != null && (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 shadow-sm animate-in fade-in slide-in-from-top-2">
                  <span className="text-[10px] text-slate-500 font-medium">צפי יומי:</span>
                  <span className="text-xs font-bold text-slate-600">{expectedDailyYield.toFixed(1)} kWh</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="h-72" dir="ltr">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            <div>מושך נתונים...</div>
          </div>
        ) : !chartDataWithExpected || chartDataWithExpected.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 border border-dashed rounded-xl">
            אין נתונים לתקופה זו
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {isDay ? (
              <LineChart data={chartDataWithExpected} margin={{ top: 5, right: 10, left: 10, bottom: 14 }}>
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
                  formatter={(value, name) => [`${Number(value)?.toFixed(2)} kW`, name === 'expectedValue' ? 'צפי' : 'הספק']}
                  labelFormatter={minutesToTime}
                />
                {showExpected && (
                  <Line type="monotone" dataKey="expectedValue" name="expectedValue" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                )}
                <Line type="monotone" dataKey="value" name="value" stroke={color} strokeWidth={2} dot={false}
                  connectNulls
                  activeDot={{ r: 6, fill: color, stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            ) : (
              <ComposedChart data={chartDataWithExpected} margin={{ top: 5, right: 10, left: 10, bottom: 14 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11, textAnchor: 'middle' }} axisLine={false} tickLine={false} padding={{ left: 20, right: 20 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                  domain={[0, 'auto']}
                  label={{ value: yUnit, angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                  cursor={{ fill: 'rgba(59,130,246,0.05)' }}
                  formatter={(value, name) => [`${Number(value)?.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${yUnit}`, name === 'expectedValue' ? 'צפי' : 'תפוקה']}
                />
                <Bar dataKey="value" name="value" fill={color} radius={[4, 4, 0, 0]}
                  barSize={timeframe === 'month' ? barSize : 28} />
                {showExpected && (
                  <Line type="monotone" dataKey="expectedValue" name="expectedValue" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                )}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}