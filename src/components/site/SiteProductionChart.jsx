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

export default function SiteProductionChart({ stationId, sungrowStationId, sungrowConnectionId, cescPlantId }) {
  const isSungrow = !stationId && !!sungrowStationId;
  const isCesc = !stationId && !sungrowStationId && !!cescPlantId;
  const [timeframe, setTimeframe] = useState('today');
  // offset: 0 = current, -1 = one back, etc.
  const [offset, setOffset] = useState(0);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [showExpected, setShowExpected] = useState(false);

  const { data: siteArray } = useQuery({
    queryKey: ['siteForChart', stationId, sungrowStationId, cescPlantId],
    queryFn: () => {
      if (stationId) return base44.entities.Site.filter({ solis_station_id: stationId });
      if (sungrowStationId) return base44.entities.Site.filter({ sungrow_station_id: sungrowStationId });
      if (cescPlantId) return base44.entities.Site.filter({ cesc_plant_id: cescPlantId });
      return [];
    },
    enabled: !!(stationId || sungrowStationId || cescPlantId)
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

  const queryKey = ['stationGraph_v5', stationId, sungrowStationId, timeframe, offset];

  const { data: chartData, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!stationId && !sungrowStationId && !cescPlantId) return [];

      // ── CESC path ──
        if (isCesc) {
          if (isDay) {
            const dateKey = format(refDate, 'yyyy-MM-dd');
            const res = await base44.functions.invoke('getCescGraphData', {
              plant_id: cescPlantId,
              timeframe: 'day',
              date: dateKey
            });
            const raw = res.data?.data || [];
            return raw.filter(d => d.time).map(d => ({ label: d.time, minutes: timeToMinutes(d.time), value: d.value })).sort((a, b) => a.minutes - b.minutes);
          }
          if (timeframe === 'month') {
            const dateKey = format(refDate, 'yyyy-MM');
            const res = await base44.functions.invoke('getCescGraphData', {
              plant_id: cescPlantId,
              timeframe: 'month',
              date: dateKey
            });
            const items = res.data?.data || [];
            const daysInMonth = getDaysInMonth(refDate);
            const byDay = {};
            items.forEach(item => {
              const parts = (item.date_id || '').split('-');
              const day = parts.length > 2 ? parseInt(parts[2], 10) : null;
              if (day) byDay[day] = parseFloat(item.energy || 0);
            });
            return Array.from({ length: daysInMonth }, (_, i) => ({ label: String(i + 1).padStart(2, '0'), value: byDay[i + 1] || 0 }));
          }
          if (timeframe === 'year') {
            const dateKey = format(refDate, 'yyyy');
            const res = await base44.functions.invoke('getCescGraphData', {
              plant_id: cescPlantId,
              timeframe: 'year',
              date: dateKey
            });
            const items = res.data?.data || [];
            const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
            const byMonth = {};
            items.forEach(item => {
              const parts = (item.date_id || '').split('-');
              const m = parts.length > 1 ? parts[1] : null;
              if (m) byMonth[m] = parseFloat(item.energy || 0);
            });
            return months.map(m => ({ label: m, value: byMonth[m] || 0 }));
          }
          return [];
        }

      // ── SUNGROW path ──
      if (isSungrow) {
        const sgTimeframe = isDay ? 'day' : timeframe;
        const sgDate = isDay ? format(refDate, 'yyyyMMdd') : timeframe === 'month' ? format(refDate, 'yyyyMM') : format(refDate, 'yyyy');
        const res = await base44.functions.invoke('getSungrowGraphData', {
          connection_id: sungrowConnectionId,
          ps_id: sungrowStationId,
          timeframe: sgTimeframe,
          date: sgDate
        });
        const sgResult = res.data?.result;
        if (!sgResult) return [];
        const d = sgResult.data;

        // site_aggregate fallback — show bar chart with what we have from DB
        if (sgResult.endpoint === 'site_aggregate') {
          if (isDay) return [];
          if (timeframe === 'month') {
            const daysInMonth = getDaysInMonth(refDate);
            const avgPerDay = (d.monthly_yield || 0) / daysInMonth;
            return Array.from({ length: daysInMonth }, (_, i) => ({ label: String(i+1).padStart(2,'0'), value: 0, estimated: avgPerDay }));
          }
          if (timeframe === 'year') {
            const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
            return months.map(m => ({ label: m, value: 0 }));
          }
          return [];
        }

        // db_snapshot / station_list fallback
        if (sgResult.endpoint === 'db_snapshot' || sgResult.endpoint === 'station_list_monthly' || sgResult.endpoint === 'station_list_yearly') {
          const items = d?.dataList || [];
          if (timeframe === 'month') {
            const daysInMonth = getDaysInMonth(refDate);
            const byDay = {};
            items.forEach(item => {
              const day = parseInt(String(item.date_id || '').slice(-2), 10);
              if (day) byDay[day] = parseFloat(item.energy || 0);
            });
            return Array.from({ length: daysInMonth }, (_, i) => ({ label: String(i+1).padStart(2,'0'), value: byDay[i+1] || 0 }));
          }
          if (timeframe === 'year') {
            const byMonth = {};
            items.forEach(item => {
              const m = String(item.date_id || '').slice(-2);
              if (m) byMonth[m] = parseFloat(item.energy || 0);
            });
            const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
            return months.map(m => ({ label: m, value: byMonth[m] || 0 }));
          }
          return [];
        }

        // Handle day snapshot from station_list fallback
        if (sgResult.endpoint === 'db_day_snapshot') {
          const points = d?.pointList || [];
          return points.map(p => ({
            label: p.time,
            value: p.value,
            minutes: p.time ? timeToMinutes(p.time) : 0
          })).filter(p => p.label).sort((a, b) => a.minutes - b.minutes);
        }

        if (isDay) {
          // Try various structures for power curve
          const points = d?.pointList || d?.powerList || d?.dataList || d?.curveList ||
            d?.power_point_list || d?.kpi_day_point_list || [];
          if (points.length > 0) {
            const mapped = points.map(p => {
              const timeStr = p.time_str || p.time || p.pointTime || p.point_time || '';
              const match = timeStr.match(/(\d{2}:\d{2})/);
              const label = match ? match[1] : timeStr.slice(-5);
              const raw = parseFloat(p.p_value ?? p.power ?? p.value ?? p.p ?? 0) || 0;
              // Sungrow power curve can be in W — divide if values are very large
              const val = raw > 5000 ? raw / 1000 : raw;
              return { label, value: val, minutes: label ? timeToMinutes(label) : 0 };
            }).filter(p => p.label);
            mapped.sort((a, b) => a.minutes - b.minutes);
            return mapped;
          }
          // Try flat key/value pairs (some endpoints return {p_20250309_0600: 1234, ...})
          const flatPoints = [];
          if (d && typeof d === 'object') {
            Object.entries(d).forEach(([k, v]) => {
              const m = k.match(/(\d{4})(\d{2})$/);
              if (m) {
                const hh = m[1].slice(0,2), mm = m[1].slice(2,4);
                const label = `${hh}:${mm}`;
                const raw = parseFloat(v) || 0;
                flatPoints.push({ label, value: raw > 5000 ? raw/1000 : raw, minutes: timeToMinutes(label) });
              }
            });
          }
          if (flatPoints.length > 0) return flatPoints.sort((a, b) => a.minutes - b.minutes);
          return [];
        }

        if (timeframe === 'month') {
          const items = d?.dataList || d?.energyList || d?.dayEnergyList || d?.power_point_list || [];
          const daysInMonth = getDaysInMonth(refDate);
          const byDay = {};
          items.forEach(item => {
            const dateStr = item.date_id || item.date || item.time || item.point_time || '';
            const day = parseInt(String(dateStr).slice(-2), 10);
            if (day) byDay[day] = parseFloat(item.energy || item.p_value || item.value || item.p || 0) || 0;
          });
          return Array.from({ length: daysInMonth }, (_, i) => ({
            label: String(i + 1).padStart(2, '0'),
            value: byDay[i + 1] || 0
          }));
        }

        if (timeframe === 'year') {
          const items = d?.dataList || d?.energyList || d?.monthEnergyList || d?.power_point_list || [];
          const byMonth = {};
          items.forEach(item => {
            const dateStr = item.date_id || item.date || item.time || item.point_time || '';
            const m = String(dateStr).slice(-2);
            if (m && parseInt(m) >= 1) byMonth[m] = parseFloat(item.energy || item.p_value || item.value || item.p || 0) || 0;
          });
          const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
          return months.map(m => ({ label: m, value: byMonth[m] || 0 }));
        }
        return [];
      }

      // ── SOLIS path (original) ──
      if (isDay) {
        const dateKey = format(refDate, 'yyyy-MM-dd');
        const snaps = await base44.entities.SiteGraphSnapshot.filter({ station_id: stationId, date_key: dateKey });
        let raw = snaps?.[0]?.data || [];
        const existingSnapshotId = snaps?.[0]?.id || null;
        const hasValidTimes = raw.length > 0 && !raw.some(d => !d.time || d.time === '');

        if (raw.length === 0 || !hasValidTimes) {
          const res = await base44.functions.invoke('getSolisGraphData', {
            endpoint: '/v1/api/stationDay',
            body: { id: stationId, time: dateKey, timezone: 2 }
          });
          const solisRaw = (res.data?.success && Array.isArray(res.data?.data)) ? res.data.data : [];
          raw = solisRaw.map(item => {
            let label = '';
            if (item.timeStr) {
              const match = item.timeStr.trim().match(/(\d{2}:\d{2})/);
              label = match ? match[1] : '';
            }
            const pec = parseFloat(item.powerPec) || 0.001;
            const valueKw = parseFloat(((parseFloat(item.power) || 0) * pec).toFixed(3));
            return { time: label, value: isFinite(valueKw) ? valueKw : 0 };
          }).filter(d => d.time !== '');
          raw.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
          if (raw.length > 0) {
            if (existingSnapshotId) base44.entities.SiteGraphSnapshot.update(existingSnapshotId, { data: raw }).catch(() => {});
            else base44.entities.SiteGraphSnapshot.create({ station_id: stationId, date_key: dateKey, data: raw }).catch(() => {});
          }
        }
        return raw.filter(d => d.time).map(d => ({ label: d.time, minutes: timeToMinutes(d.time), value: d.value })).sort((a, b) => a.minutes - b.minutes);
      }

      let endpoint = '';
      let body = { id: stationId, timezone: 2 };
      if (timeframe === 'month') { endpoint = '/v1/api/stationMonth'; body.month = format(refDate, 'yyyy-MM'); }
      else if (timeframe === 'year') { endpoint = '/v1/api/stationYear'; body.year = format(refDate, 'yyyy'); }

      const res = await base44.functions.invoke('getSolisGraphData', { endpoint, body });
      if (!res.data?.success || !res.data?.data) return [];
      const raw = res.data.data;
      const dcCap = Number(site?.dc_capacity_kwp) || Number(site?.ac_capacity_kw) || 0;

      const parseEnergyToKwh = (item, isMonthly) => {
        const rawVal = parseFloat(String(item.energy || '0').replace(/,/g, '')) || 0;
        const pec = parseFloat(String(item.energyPec !== undefined ? item.energyPec : '1').replace(/,/g, '')) || 1;
        const valInUnit = rawVal * pec;
        const unit = (item.energyStr || '').toLowerCase();
        let kwh = valInUnit;
        if (unit === 'gwh') kwh = valInUnit * 1000000;
        else if (unit === 'mwh') kwh = valInUnit * 1000;
        else if (unit === 'wh') kwh = valInUnit / 1000;
        if (dcCap > 0) {
          const maxReasonable = isMonthly ? dcCap * 350 : dcCap * 15;
          if (kwh > maxReasonable * 5) kwh = kwh / 1000;
        }
        return kwh;
      };

      if (timeframe === 'month') {
        const daysInMonth = getDaysInMonth(refDate);
        const byDay = {};
        raw.forEach(item => {
          const parts = (item.dateStr || '').split('-');
          const day = parts.length > 2 ? parseInt(parts[2], 10) : null;
          if (day) byDay[day] = parseEnergyToKwh(item, false);
        });
        return Array.from({ length: daysInMonth }, (_, i) => ({ label: String(i + 1).padStart(2, '0'), value: byDay[i + 1] || 0 }));
      }
      if (timeframe === 'year') {
        const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
        const byMonth = {};
        raw.forEach(item => {
          const parts = (item.dateStr || '').split('-');
          const m = parts.length > 1 ? parts[1] : null;
          if (m) byMonth[m] = parseEnergyToKwh(item, true);
        });
        return months.map(m => ({ label: m, value: byMonth[m] || 0 }));
      }
      return [];
    },
    enabled: !!(stationId || sungrowStationId || cescPlantId)
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
    const dcCap = Number(site?.dc_capacity_kwp) || Number(site?.ac_capacity_kw) || 0;
    const kwhPerKwp = Number(site?.annual_kwh_per_kwp) || 1650;
    let yieldVal = dcCap * kwhPerKwp;

    if (site?.string_configs?.length > 0 && systemSettings?.orientation_kwh_per_kwp) {
       let totalDcYield = 0;
       const panelWatt = Number(site?.panel_watt) || 0;
       site.string_configs.forEach(s => {
          let kwp = (Number(s.num_panels || 0) * panelWatt) / 1000;
          if (kwp === 0 && dcCap > 0 && site.string_configs.length > 0) {
            kwp = dcCap / site.string_configs.length;
          }
          const kwh_kwp = Number(systemSettings.orientation_kwh_per_kwp[s.orientation || 'south']) || kwhPerKwp;
          totalDcYield += kwp * kwh_kwp;
       });
       if (totalDcYield > 0) {
          yieldVal = totalDcYield;
       }
    }

    // Absolute fallback so it's never "on the floor" even if site config is completely missing
    if (yieldVal === 0) {
      yieldVal = 100 * kwhPerKwp; 
    }

    const getExpectedMonthlyPercentage = (monthIndex) => {
      const defaultPercentages = [6, 7, 9, 10, 11, 11, 11, 10, 9, 7, 5, 4];
      let val = defaultPercentages[monthIndex];
      if (systemSettings?.monthly_production_percentages) {
         const raw = Number(systemSettings.monthly_production_percentages[monthIndex + 1]);
         if (!isNaN(raw) && raw > 0) {
            val = raw < 1 ? raw * 100 : raw; // Convert 0.06 to 6% if entered as decimal
         }
      }
      return val;
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
      const daysInMonth = getDaysInMonth(refDate);
      
      const prevMonth = monthIndex === 0 ? 11 : monthIndex - 1;
      const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1;
      
      const expectedThisMonth = expectedAnnualYield * (getExpectedMonthlyPercentage(monthIndex) / 100);
      const expectedPrevMonth = expectedAnnualYield * (getExpectedMonthlyPercentage(prevMonth) / 100);
      const expectedNextMonth = expectedAnnualYield * (getExpectedMonthlyPercentage(nextMonth) / 100);
      
      const avgThis = expectedThisMonth / daysInMonth;
      const avgPrev = expectedPrevMonth / 30;
      const avgNext = expectedNextMonth / 30;

      return chartData.map((d, i) => {
        const progress = (i + 1) / daysInMonth;
        let expectedValue = avgThis;
        // Smooth transition curve between months (simulating seasonal curve)
        if (progress < 0.5) {
           expectedValue = avgThis + (avgPrev - avgThis) * (0.5 - progress);
        } else {
           expectedValue = avgThis + (avgNext - avgThis) * (progress - 0.5);
        }
        return { ...d, expectedValue };
      });
    }

    if (isDay) {
      const dayExpected = expectedDailyYield || 0;
      const monthIndex = refDate.getMonth();
      
      // Approximate daylight hours for each month in Israel
      const daylightHoursByMonth = [10, 10.5, 12, 13, 14, 14.2, 14, 13, 12, 11, 10.5, 10];
      const W = daylightHoursByMonth[monthIndex];
      const startHour = 12 - (W / 2);
      const endHour = 12 + (W / 2);
      
      // A typical solar production curve resembles a squared sine wave.
      // The area under a curve P * sin^2(pi * t / W) is (P * W) / 2.
      const peakKw = dayExpected / (W / 2); 
      
      // Inverter AC capacity acts as a ceiling (clipping) for power export
      const acLimit = site?.ac_capacity_kw || peakKw;

      return chartData.map(d => {
        let expectedValue = 0;
        if (d.minutes) {
          const hours = d.minutes / 60;
          if (hours > startHour && hours < endHour) {
            // Squared sine wave for a more realistic "bell" shape
            const rad = Math.PI * (hours - startHour) / W;
            expectedValue = peakKw * Math.pow(Math.sin(rad), 2);
            
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