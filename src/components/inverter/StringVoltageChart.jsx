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
      <div className="rounded-lg p-3 backdrop-blur-md border" 
           style={{ 
             background: 'rgba(26, 31, 46, 0.95)', 
             borderColor: '#58a6ff' 
           }}>
        <p className="text-white font-bold mb-2">מחרוזת {d.name}</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">מתח:</span>
            <span className="text-[#58a6ff]">{d.voltage.toFixed(1)} V</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">זרם:</span>
            <span className="text-[#00ff88]">{d.current.toFixed(2)} A</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
      <h4 className="text-white font-bold mb-3">גרף מתח וזרם מחרוזות</h4>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <XAxis 
              dataKey="name"
              tick={{ fill: '#8b949e', fontSize: 11 }}
              stroke="#30363d"
              label={{ value: 'מחרוזת', position: 'insideBottom', offset: -10, fill: '#8b949e' }}
            />
            <YAxis 
              yAxisId="left"
              tick={{ fill: '#8b949e', fontSize: 11 }}
              stroke="#30363d"
              label={{ value: 'V', angle: -90, position: 'insideLeft', fill: '#58a6ff' }}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#8b949e', fontSize: 11 }}
              stroke="#30363d"
              label={{ value: 'A', angle: 90, position: 'insideRight', fill: '#00ff88' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="voltage" 
              stroke="#58a6ff" 
              strokeWidth={2}
              dot={{ fill: '#58a6ff', r: 4 }}
              activeDot={{ r: 6, fill: '#58a6ff', stroke: '#000', strokeWidth: 2 }}
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="current" 
              stroke="#00ff88" 
              strokeWidth={2}
              dot={{ fill: '#00ff88', r: 4 }}
              activeDot={{ r: 6, fill: '#00ff88', stroke: '#000', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: '#58a6ff' }} />
          <span>מתח (V)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: '#00ff88' }} />
          <span>זרם (A)</span>
        </div>
      </div>
    </Card>
  );
}