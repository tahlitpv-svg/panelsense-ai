import React from 'react';
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function KPICard({ title, value, unit, icon: Icon, trend, color = "#4ade80" }) {
  const isGreen = color === '#10b981' || color === '#4ade80';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl p-5 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300"
      style={{
        background: 'linear-gradient(135deg, #161c26 0%, #1a2235 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)'
      }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />

      <div className="flex justify-between items-start mb-4">
        <div className="p-2.5 rounded-xl transition-colors"
          style={{ background: `rgba(${isGreen ? '74,222,128' : '249,115,22'},0.1)` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-lg ${
            trend > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {trend > 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      <h3 className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">{title}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        <span className="text-sm font-medium" style={{ color }}>{unit}</span>
      </div>

      {/* Subtle glow blob */}
      <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full blur-2xl opacity-20 pointer-events-none"
        style={{ background: color }} />
    </motion.div>
  );
}