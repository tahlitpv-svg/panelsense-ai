import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/card";

export default function MPPTChart({ mpptStrings }) {
  if (!mpptStrings || mpptStrings.length === 0) {
    return (
      <Card className="p-6 border border-slate-200 shadow-sm bg-white text-center py-12">
        <h4 className="text-slate-800 font-bold mb-3">גרף מחרוזות MPPT</h4>
        <div className="text-slate-400">
          אין נתוני MPPT זמינים
        </div>
      </Card>
    );
  }

  const data = mpptStrings.map(string => ({
    name: string.string_id || 'N/A',
    voltage: string.voltage_v || 0,
    current: string.current_a || 0,
    power: string.power_kw || 0
  }));

  // Calculate average power to identify low performers
  const avgPower = data.reduce((sum, d) => sum + d.power, 0) / data.length;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    
    return (
      <div className="rounded-lg p-3 bg-white border border-slate-200 shadow-lg text-sm">
        <p className="text-slate-800 font-bold mb-2">מחרוזת {d.name}</p>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">מתח:</span>
            <span className="text-orange-500 font-medium">{d.voltage.toFixed(1)} V</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">זרם:</span>
            <span className="text-blue-500 font-medium">{d.current.toFixed(2)} A</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">הספק:</span>
            <span className="text-emerald-500 font-bold">{d.power.toFixed(2)} kW</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6 border border-slate-200 shadow-sm bg-white">
      <h4 className="text-slate-800 font-bold mb-6">גרף הספק מחרוזות MPPT</h4>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <XAxis 
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#e2e8f0"
              axisLine={false}
              tickLine={false}
              label={{ value: 'מחרוזת', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 11 }}
            />
            <YAxis 
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#e2e8f0"
              axisLine={false}
              tickLine={false}
              label={{ value: 'kW', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Bar dataKey="power" radius={[4, 4, 0, 0]} maxBarSize={60}>
              {data.map((entry, index) => {
                // Color based on performance relative to average
                const isLow = entry.power < avgPower * 0.85;
                const color = isLow ? '#ef4444' : '#10b981';
                return <Cell key={`cell-${index}`} fill={color} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-500 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-500" />
          <span>ביצועים תקינים</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-500" />
          <span>ביצועים נמוכים (מתחת ל-85% מהממוצע)</span>
        </div>
      </div>
    </Card>
  );
}