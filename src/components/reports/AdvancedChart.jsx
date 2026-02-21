import React from 'react';
import { Card } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { motion } from "framer-motion";

export default function AdvancedChart({ data, title, dataKey, color = "#f97316" }) {
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-lg p-3 border border-slate-200 shadow-lg text-sm"
      >
        <p className="font-bold text-slate-800 mb-1">{d.name}</p>
        <p style={{ color }}>{d[dataKey]?.toLocaleString()} kWh</p>
      </motion.div>
    );
  };

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
      <div className="p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-6">{title}</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis 
                dataKey="name" 
                tick={{ fill: '#64748b', fontSize: 11 }}
                stroke="#e2e8f0"
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: '#64748b', fontSize: 11 }}
                stroke="#e2e8f0"
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: color, strokeWidth: 2, strokeDasharray: '3 3' }} />
              <Area 
                type="monotone" 
                dataKey={dataKey} 
                stroke={color}
                strokeWidth={2}
                fill={`url(#gradient-${dataKey})`}
                animationDuration={1500}
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}