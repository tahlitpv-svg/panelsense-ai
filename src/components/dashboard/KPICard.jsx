import React from 'react';
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function KPICard({ title, value, unit, icon: Icon, trend, color = "#16a34a" }) {
  const isGreen = color === '#10b981' || color === '#16a34a' || color === '#4ade80';
  
  // Create an rgba version of the color for the background
  const getRgba = (hex, alpha) => {
    if (!hex.startsWith('#')) return `rgba(22,163,74,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl p-3 md:p-5 relative overflow-hidden group hover:shadow-md transition-all duration-300 border border-slate-200 shadow-sm"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-2.5 rounded-xl transition-colors"
          style={{ background: getRgba(color, 0.1) }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-lg ${
            trend > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {trend > 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      <h3 className="text-slate-500 text-xs font-medium mb-1 uppercase tracking-wider">{title}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-slate-900">{value}</span>
        <span className="text-sm font-medium" style={{ color }}>{unit}</span>
      </div>
    </motion.div>
  );
}