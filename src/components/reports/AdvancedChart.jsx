import React from 'react';
import { Card } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { motion } from "framer-motion";

export default function AdvancedChart({ data, title, dataKey, color = "#00ff88" }) {
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="futuristic-card rounded-lg p-4"
      >
        <p className="font-semibold text-white mb-2">{d.name}</p>
        <p style={{ color }}>{d[dataKey]?.toLocaleString()} kWh</p>
      </motion.div>
    );
  };

  return (
    <Card className="border-0 overflow-hidden futuristic-card">
      <div className="p-6">
        <h3 className="text-xl font-bold text-white mb-6 neon-glow">{title}</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" opacity={0.3} />
              <XAxis 
                dataKey="name" 
                tick={{ fill: '#8b949e', fontSize: 12 }}
                stroke="#30363d"
              />
              <YAxis 
                tick={{ fill: '#8b949e', fontSize: 12 }}
                stroke="#30363d"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: color, strokeWidth: 2 }} />
              <Area 
                type="monotone" 
                dataKey={dataKey} 
                stroke={color}
                strokeWidth={3}
                fill={`url(#gradient-${dataKey})`}
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}