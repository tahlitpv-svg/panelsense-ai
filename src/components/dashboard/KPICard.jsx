import React from 'react';
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function KPICard({ title, value, unit, icon: Icon, trend, color = "#f97316" }) {
  // Map old neon colors to new theme if needed, or stick to passed props
  // We'll enforce a clean look regardless of prop color
  const accentColor = color === '#00ff88' ? '#10b981' : color; 

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-br from-white via-slate-50 to-slate-200 rounded-2xl p-6 shadow-lg border border-white/60 hover:shadow-xl hover:border-white transition-all duration-300 relative overflow-hidden group"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 rounded-xl bg-slate-50 group-hover:bg-orange-50 transition-colors">
          <Icon className="w-6 h-6 text-slate-500 group-hover:text-orange-500 transition-colors" />
        </div>
        
        {trend && (
          <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-lg ${
            trend > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          }`}>
            {trend > 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      <div>
        <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-slate-800">{value}</span>
          <span className="text-sm text-slate-400 font-medium">{unit}</span>
        </div>
      </div>
      
      {/* Subtle decorative background blob */}
      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-gradient-to-br from-slate-50 to-orange-50 rounded-full opacity-50 blur-2xl pointer-events-none" />
    </motion.div>
  );
}