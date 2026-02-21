import React from 'react';
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function StatCard({ icon: Icon, label, value, unit, trend, color = "#f97316" }) {
  // Map neon green to orange if passed from old code, or keep as is if intentional
  const displayColor = color === '#00ff88' ? '#f97316' : color;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-all">
        <div className="p-6 relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-lg bg-slate-50 group-hover:bg-orange-50 transition-colors">
              <Icon className="w-5 h-5 text-slate-500 group-hover:text-orange-500 transition-colors" />
            </div>
            {trend && (
              <div className={`px-2 py-1 rounded-md text-xs font-bold flex items-center ${
                trend > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                {trend > 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                {Math.abs(trend)}%
              </div>
            )}
          </div>
          
          <div className="text-slate-500 text-xs font-medium mb-1 uppercase tracking-wider">{label}</div>
          <div className="flex items-baseline gap-1">
            <div className="text-2xl font-bold text-slate-800">
              {value}
            </div>
            <div className="text-xs font-medium text-slate-400">{unit}</div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}