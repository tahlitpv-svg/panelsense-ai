import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Loader2, Thermometer } from "lucide-react";
import { format } from "date-fns";

const timeToMinutes = (t) => {
  const [h, m] = (t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const minutesToTime = (mins) => {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-md text-xs">
      <div className="font-bold text-slate-600 mb-1">{minutesToTime(label)}</div>
      <div className="flex items-center gap-1 text-orange-600 font-semibold">
        <Thermometer className="w-3 h-3" />
        {val != null ? `${val}°C` : '—'}
      </div>
    </div>
  );
};

export default function TemperatureChart({ inverterId, inverterSn, inverter, site }) {
  const today = format(new Date(), 'yyyy-MM-dd');

  const isSungrow = inverter?.sungrow_device_id && !inverterId;

  const { data, isLoading, error } = useQuery({
    queryKey: ['inverterTemp', inverter?.id],
    queryFn: async () => {
      if (!inverter?.id) return [];
      const snaps = await base44.entities.InverterGraphSnapshot.filter({ 
        inverter_id: inverter.id, 
        date_key: today 
      });
      return snaps[0]?.data || [];
    },
    enabled: !!inverter?.id,
    refetchInterval: 5 * 60 * 1000
  });

  const chartData = (data || [])
    .map(d => ({ ...d, minutes: timeToMinutes(d.time || d.timeStr) }))
    .sort((a, b) => a.minutes - b.minutes);

  const maxTemp = chartData.length > 0 ? Math.max(...chartData.map(d => d.temperature || 0)) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-2 text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin" />
        טוען נתוני טמפרטורה...
      </div>
    );
  }

  if (error || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 border border-dashed rounded-xl text-slate-400 text-sm">
        אין נתוני טמפרטורה להיום
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {maxTemp !== null && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Thermometer className="w-4 h-4 text-orange-500" />
          <span>טמפרטורה מקסימלית היום:</span>
          <span className={`font-bold ${maxTemp > 75 ? 'text-red-600' : maxTemp > 60 ? 'text-orange-500' : 'text-slate-700'}`}>
            {maxTemp}°C
          </span>
        </div>
      )}
      <div className="h-48 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="minutes"
              type="number"
              domain={[5 * 60, 20 * 60]}
              ticks={[6 * 60, 10 * 60, 14 * 60, 18 * 60]}
              tickFormatter={minutesToTime}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${v}°`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '75°C', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
            <ReferenceLine y={60} stroke="#f97316" strokeDasharray="4 4" label={{ value: '60°C', fill: '#f97316', fontSize: 10, position: 'insideTopRight' }} />
            <Line
              type="monotone"
              dataKey="temperature"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#f97316' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}