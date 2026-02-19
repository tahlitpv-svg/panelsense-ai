import React from 'react';
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function StatCard({ icon: Icon, label, value, unit, trend, color = "#00ff88" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.05, y: -5 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-0 overflow-hidden futuristic-card relative group">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="p-6 relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-xl" style={{ background: `${color}20` }}>
              <Icon className="w-6 h-6" style={{ color }} />
            </div>
            {trend && (
              <div className="px-3 py-1 rounded-full text-xs font-bold" 
                   style={{ 
                     background: trend > 0 ? '#00ff8820' : '#ff333320',
                     color: trend > 0 ? '#00ff88' : '#ff3333'
                   }}>
                {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
              </div>
            )}
          </div>
          <div className="text-gray-400 text-sm mb-2">{label}</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold text-white neon-glow">
              {value}
            </div>
            <div className="text-sm text-gray-400">{unit}</div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r" 
             style={{ 
               backgroundImage: `linear-gradient(90deg, ${color}, transparent)` 
             }} />
      </Card>
    </motion.div>
  );
}