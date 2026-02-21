import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";

export default function StringVoltageChart({ mpptStrings }) {
  if (!mpptStrings || mpptStrings.length === 0) {
    return null;
  }

  const data = mpptStrings.map(string => ({
    name: string.string_id || 'N/A',
    voltage: string.voltage_v || 0,
    current: string.current_a || 0
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    
    return (
      <div className="rounded-lg p-3 bg-white border border-slate-200 shadow-lg text-sm">
        <p className="font-bold text-slate-800 mb-2">מחרוזת {d.name}</p>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">מתח:</span>
            <span className="text-blue-600 font-medium">{d.voltage.toFixed(1)} V</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">זרם:</span>
            <span className="text-emerald-600 font-medium">{d.current.toFixed(2)} A</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6 border border-slate-200 shadow-sm bg-white">
      <h4 className="text-slate-800 font-bold mb-6">גרף מתח וזרם מחרוזות</h4>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <XAxis 
              dataKey="name"
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#e2e8f0"
              axisLine={false}
              tickLine={false}
              label={{ value: 'מחרוזת', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 11 }}
            />
            <YAxis 
              yAxisId="left"
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#e2e8f0"
              axisLine={false}
              tickLine={false}
              label={{ value: 'V', angle: -90, position: 'insideLeft', fill: '#3b82f6' }}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#e2e8f0"
              axisLine={false}
              tickLine={false}
              label={{ value: 'A', angle: 90, position: 'insideRight', fill: '#10b981' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="voltage" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="current" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={{ fill: '#10b981', r: 4 }}
              activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-500 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>מתח (V)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span>זרם (A)</span>
        </div>
      </div>
    </Card>
  );
}