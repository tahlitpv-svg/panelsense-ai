import React from 'react';
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function KPICard({ title, value, unit, icon: Icon, trend, color = "#00ff88" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden border-0 shadow-2xl" 
            style={{ 
              background: 'linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)',
              borderLeft: `4px solid ${color}`
            }}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${color}20` }}>
              <Icon className="w-6 h-6" style={{ color }} />
            </div>
            {trend && (
              <div className="text-sm font-medium" style={{ color: trend > 0 ? '#00ff88' : '#ff3333' }}>
                {trend > 0 ? '+' : ''}{trend}%
              </div>
            )}
          </div>
          <div className="text-gray-400 text-sm font-medium mb-1">{title}</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold" style={{ color: '#fff' }}>
              {value}
            </div>
            <div className="text-lg text-gray-400">{unit}</div>
          </div>
        </div>
        <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full opacity-10"
             style={{ backgroundColor: color }} />
      </Card>
    </motion.div>
  );
}