import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";

// Fetch one station's day data and return array of { time, power }
async function fetchStationDay(stationId, dateStr) {
  try {
    const res = await base44.functions.invoke('getSolisGraphData', {
      endpoint: '/v1/api/stationDay',
      body: { id: stationId, time: dateStr, timezone: 2 }
    });
    if (res.data?.success && res.data?.data) {
      return res.data.data.map(p => ({
        time: p.timeStr ? p.timeStr.split(' ')[1]?.slice(0, 5) : p.time,
        power: parseFloat((parseFloat(p.power || 0) / 1000).toFixed(2))
      }));
    }
  } catch (_) {}
  return [];
}

// Fetch one station's month data
async function fetchStationMonth(stationId, monthStr) {
  try {
    const res = await base44.functions.invoke('getSolisGraphData', {
      endpoint: '/v1/api/stationMonth',
      body: { id: stationId, month: monthStr, timezone: 2 }
    });
    if (res.data?.success && res.data?.data) {
      return res.data.data.map(p => ({
        date: p.dateStr?.split('-')[2] || p.dateStr,
        energy: parseFloat(p.energy || 0)
      }));
    }
  } catch (_) {}
  return [];
}

// Merge multiple station arrays by time/date key, summing values
function mergeByKey(arrays, key, valueKey) {
  const map = {};
  arrays.forEach(arr => {
    arr.forEach(item => {
      const k = item[key];
      if (!map[k]) map[k] = { [key]: k, value: 0 };
      map[k].value += item[valueKey] || 0;
    });
  });
  return Object.values(map).sort((a, b) => a[key].localeCompare(b[key]));
}

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg p-3 shadow-lg bg-white border border-slate-200 text-sm">
      <p className="font-bold text-slate-900 mb-1">{label}</p>
      <p className="text-green-700 font-bold">{payload[0]?.value?.toFixed(2)} {unit}</p>
    </div>
  );
};

export default function FleetProductionChart({ sites, timeframe = 'hourly' }) {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const yesterday = format(subDays(now, 1), 'yyyy-MM-dd');
  const thisMonth = format(now, 'yyyy-MM');

  // Pick stations with a solis_station_id
  const stationIds = useMemo(() =>
    sites.filter(s => s.solis_station_id).map(s => s.solis_station_id),
    [sites]
  );

  // Hourly: today's power curve - sum across all stations
  const { data: hourlyData, isLoading: loadingHourly } = useQuery({
    queryKey: ['fleetDay', today, stationIds.join(',')],
    queryFn: async () => {
      if (stationIds.length === 0) return [];
      const all = await Promise.all(stationIds.map(id => fetchStationDay(id, today)));
      return mergeByKey(all, 'time', 'power');
    },
    enabled: timeframe === 'hourly' && stationIds.length > 0,
    staleTime: 5 * 60 * 1000
  });

  // Daily: this month's daily yield - sum across all stations
  const { data: dailyData, isLoading: loadingDaily } = useQuery({
    queryKey: ['fleetMonth', thisMonth, stationIds.join(',')],
    queryFn: async () => {
      if (stationIds.length === 0) return [];
      const all = await Promise.all(stationIds.map(id => fetchStationMonth(id, thisMonth)));
      return mergeByKey(all, 'date', 'energy');
    },
    enabled: timeframe === 'daily' && stationIds.length > 0,
    staleTime: 30 * 60 * 1000
  });

  // Monthly: use site.monthly_yield_kwh from DB (real data from sync)
  const monthlyData = useMemo(() => {
    if (timeframe !== 'monthly') return [];
    // Group by month is not available per-month from sites entity,
    // so show per-site daily yield summed as a bar for today only
    // Actually use monthly_yield_kwh from sites
    const total = sites.reduce((sum, s) => sum + (s.monthly_yield_kwh || 0), 0);
    const monthly = sites.reduce((sum, s) => sum + (s.yearly_yield_kwh || 0), 0);
    // Build a simple current month bar from real data
    const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    const currentMonth = now.getMonth();
    return months.map((name, i) => ({
      time: name,
      value: i === currentMonth ? parseFloat((total / 1000).toFixed(1)) : 0
    }));
  }, [sites, timeframe]);

  const isLoading = (timeframe === 'hourly' && loadingHourly) || (timeframe === 'daily' && loadingDaily);

  const chartData = useMemo(() => {
    if (timeframe === 'hourly') return (hourlyData || []).map(d => ({ time: d.time, value: parseFloat((d.value / 1000).toFixed(3)) }));
    if (timeframe === 'daily') return (dailyData || []).map(d => ({ time: d.date, value: parseFloat((d.value / 1000).toFixed(2)) }));
    return monthlyData;
  }, [timeframe, hourlyData, dailyData, monthlyData]);

  const unit = timeframe === 'hourly' ? 'MW' : 'MWh';
  const yLabel = unit;

  if (stationIds.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-slate-400 text-sm border border-dashed rounded-xl">
        אין אתרים עם נתוני Solis
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-80 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-green-500" />
        <span className="text-sm">מושך נתוני ייצור...</span>
      </div>
    );
  }

  // For hourly chart: build a full day skeleton 06:00–20:00 and merge real data into it
  const buildFullDayData = (data) => {
    const map = {};
    (data || []).forEach(d => { if (d && d.time) map[d.time] = d.value; });
    const points = [];
    for (let h = 6; h <= 20; h++) {
      const label = `${String(h).padStart(2, '0')}:00`;
      points.push({ time: label, value: map[label] !== undefined ? map[label] : null });
    }
    // Also fill in real data points that fall between hours
    (data || []).forEach(d => {
      if (d && d.time && !points.find(p => p.time === d.time)) {
        points.push({ time: d.time, value: d.value });
      }
    });
    return points.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  };

  // Only show whole-hour ticks on X axis for hourly view
  const hourlyTicks = Array.from({ length: 15 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);

  const displayData = timeframe === 'hourly'
    ? buildFullDayData(chartData)
    : (chartData.length === 0
        ? []
        : chartData.length === 1
          ? [{ time: '', value: 0 }, ...chartData, { time: '  ', value: 0 }]
          : chartData);

  if (timeframe !== 'hourly' && displayData.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-sm border border-dashed rounded-xl gap-2">
        <span>אין נתוני ייצור</span>
        <span className="text-xs text-slate-300">הנתונים מתעדכנים מ-Solis Cloud</span>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          {timeframe === 'daily' || timeframe === 'monthly' ? (
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ fill: 'rgba(22,163,74,0.05)' }} />
              <Bar dataKey="value" fill="#16a34a" radius={[4, 4, 0, 0]} barSize={timeframe === 'daily' ? 10 : 32} />
            </BarChart>
          ) : (
            <AreaChart data={displayData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={true} tickLine={false}
              ticks={hourlyTicks} interval={0} minTickGap={20} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12, offset: -2 }} />
            <Tooltip content={<CustomTooltip unit={unit} />} />
            <Area type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2}
              fill="url(#colorPower)" dot={false}
              activeDot={{ r: 5, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}