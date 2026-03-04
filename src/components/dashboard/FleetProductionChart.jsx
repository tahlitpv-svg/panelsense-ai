import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg p-3 shadow-lg bg-white border border-slate-200 text-sm">
      <p className="font-bold text-slate-900 mb-1">{label}</p>
      <p className="text-orange-600 font-bold">{(payload[0]?.value || 0).toFixed(3)} {unit}</p>
    </div>
  );
};

export default function FleetProductionChart({ sites, timeframe = 'hourly' }) {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const thisMonth = format(now, 'yyyy-MM');

  const dateKey = timeframe === 'daily' ? thisMonth : today;
  const snapshotTimeframe = timeframe === 'monthly' ? null : (timeframe === 'daily' ? 'daily' : 'hourly');

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ['fleetSnapshot', snapshotTimeframe, dateKey],
    queryFn: () =>
      base44.entities.FleetGraphSnapshot.filter({ timeframe: snapshotTimeframe, date_key: dateKey }),
    enabled: !!snapshotTimeframe,
    refetchInterval: 10 * 60 * 1000, // re-read every 10 min
    staleTime: 9 * 60 * 1000
  });

  const monthlyData = useMemo(() => {
    if (timeframe !== 'monthly') return [];
    const total = sites.reduce((sum, s) => sum + (s.monthly_yield_kwh || 0), 0);
    const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    return months.map((name, i) => ({
      time: name,
      value: i === now.getMonth() ? parseFloat((total / 1000).toFixed(1)) : 0
    }));
  }, [sites, timeframe]);

  const chartData = useMemo(() => {
    if (timeframe === 'monthly') return monthlyData;
    const raw = snapshot?.[0]?.data || [];
    return raw.map(d => ({ time: d.time, value: d.value }));
  }, [timeframe, snapshot, monthlyData]);

  const unit = timeframe === 'hourly' ? 'MW' : 'MWh';

  // Full day skeleton 06:00–20:00
  const buildFullDayData = (data) => {
    const map = {};
    data.forEach(d => { if (d?.time) map[d.time] = d.value; });
    const points = [];
    for (let h = 6; h <= 20; h++) {
      const label = `${String(h).padStart(2, '0')}:00`;
      points.push({ time: label, value: map[label] !== undefined ? map[label] : null });
    }
    data.forEach(d => {
      if (d?.time && !points.find(p => p.time === d.time)) {
        points.push({ time: d.time, value: d.value });
      }
    });
    return points.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  };

  const hourlyTicks = Array.from({ length: 15 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);

  const displayData = timeframe === 'hourly' ? buildFullDayData(chartData) : chartData;

  if (isLoading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-green-500" />
        <span className="text-sm">טוען נתוני ייצור...</span>
      </div>
    );
  }

  if (!isLoading && (!displayData || displayData.length === 0)) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 border border-dashed rounded-xl">
        אין נתוני גרף זמינים
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          {timeframe === 'daily' || timeframe === 'monthly' ? (
            <BarChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} tickMargin={8} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} />
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
                ticks={hourlyTicks} interval={0} minTickGap={20} tickMargin={8} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12, offset: -2 }} />
              <Tooltip content={<CustomTooltip unit={unit} />} />
              <Area type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2}
                fill="url(#colorPower)" dot={false} connectNulls={false}
                activeDot={{ r: 5, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}