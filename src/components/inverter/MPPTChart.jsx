import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/card";

export default function MPPTChart({ mpptStrings }) {
  if (!mpptStrings || mpptStrings.length === 0) {
    return (
      <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
        <h4 className="text-white font-bold mb-3">גרף מחרוזות MPPT</h4>
        <div className="text-center text-gray-400 py-8">
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
      <div className="rounded-lg p-3 backdrop-blur-md border" 
           style={{ 
             background: 'rgba(26, 31, 46, 0.95)', 
             borderColor: '#00ff88' 
           }}>
        <p className="text-white font-bold mb-2">מחרוזת {d.name}</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">מתח:</span>
            <span className="text-[#00ff88]">{d.voltage.toFixed(1)} V</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">זרם:</span>
            <span className="text-[#58a6ff]">{d.current.toFixed(2)} A</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">הספק:</span>
            <span className="text-[#ffaa00]">{d.power.toFixed(2)} kW</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
      <h4 className="text-white font-bold mb-3">גרף הספק מחרוזות MPPT</h4>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <XAxis 
              dataKey="name"
              tick={{ fill: '#8b949e', fontSize: 11 }}
              stroke="#30363d"
              label={{ value: 'מחרוזת', position: 'insideBottom', offset: -10, fill: '#8b949e' }}
            />
            <YAxis 
              tick={{ fill: '#8b949e', fontSize: 11 }}
              stroke="#30363d"
              label={{ value: 'kW', angle: -90, position: 'insideLeft', fill: '#8b949e' }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0, 255, 136, 0.1)' }} />
            <Bar dataKey="power" radius={[4, 4, 0, 0]} maxBarSize={60}>
              {data.map((entry, index) => {
                // Color based on performance relative to average
                const isLow = entry.power < avgPower * 0.85;
                const color = isLow ? '#ff3333' : '#00ff88';
                return <Cell key={`cell-${index}`} fill={color} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ background: '#00ff88' }} />
          <span>ביצועים תקינים</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ background: '#ff3333' }} />
          <span>ביצועים נמוכים (מתחת ל-85% מהממוצע)</span>
        </div>
      </div>
    </Card>
  );
}