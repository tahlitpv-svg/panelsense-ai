import React from 'react';
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function KPICard({ title, value, unit, icon: Icon, trend, color = "#00ff88" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ scale: 1.03, y: -5 }}
      className="futuristic-card rounded-2xl p-6 holographic"
      style={{
        boxShadow: `0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px ${color}40`
      }}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <motion.div 
            className="p-3 rounded-xl relative"
            style={{ 
              background: `linear-gradient(135deg, ${color}30, ${color}10)`,
              boxShadow: `0 4px 12px ${color}40`
            }}
            animate={{ rotate: [0, 5, 0, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <Icon className="w-6 h-6" style={{ color }} />
          </motion.div>
          {trend && (
            <motion.div 
              className="text-sm font-bold px-3 py-1 rounded-full"
              style={{ 
                background: trend > 0 ? '#00ff8820' : '#ff333320',
                color: trend > 0 ? '#00ff88' : '#ff3333',
                border: `1px solid ${trend > 0 ? '#00ff88' : '#ff3333'}40`
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </motion.div>
          )}
        </div>
        <div className="text-gray-400 text-xs font-medium mb-2 tracking-wider uppercase">{title}</div>
        <div className="flex items-baseline gap-2">
          <motion.div 
            className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {value}
          </motion.div>
          <div className="text-lg text-gray-500">{unit}</div>
        </div>
      </div>
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20"
           style={{ background: `radial-gradient(circle, ${color}, transparent)` }} />
    </motion.div>
  );
}