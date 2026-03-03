import React from 'react';
import { motion } from "framer-motion";
import { MapPin, Zap, AlertTriangle, WifiOff, Sun, Activity, Droplets } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const regionLabels = { north: 'צפון', center: 'מרכז', south: 'דרום', arava: 'ערבה' };

const statusConfig = {
  online: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'מקוון', dot: '#22c55e' },
  warning: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'אזהרה', dot: '#f59e0b' },
  offline: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'לא מקוון', dot: '#ef4444' }
};

export default function SiteCard({ site, regionalAverage }) {
  const config = statusConfig[site.status] || statusConfig.offline;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ duration: 0.2 }}
    >
      <Link to={createPageUrl(`SiteDetails?id=${site.id}`)}>
        <div
          className="bg-white rounded-xl overflow-hidden transition-all duration-300 border border-slate-200 shadow-sm hover:shadow-md"
        >
          {/* Top status bar */}
          <div className="h-1 w-full" style={{ background: config.color }} />

          <div className="p-4">
            {/* Header row */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0 ml-2">
                <h3 className="text-slate-900 font-bold text-sm truncate leading-tight mb-1">{site.name}</h3>
                <div className="flex items-center gap-1 text-slate-500 text-xs">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span>{regionLabels[site.region_tag] || site.region_tag}</span>
                  {site.num_inverters > 0 && (
                    <span className="mr-2 text-slate-400">• {site.num_inverters} אינוורטרים</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full shrink-0"
                style={{ background: config.bg, border: `1px solid ${config.border}` }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: config.dot }} />
                <span className="text-xs font-semibold" style={{ color: config.color }}>{config.label}</span>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">תפוקה יומית</div>
                <div className="text-base font-bold text-slate-900">{site.daily_yield_kwh?.toFixed(0) || 0}</div>
                <div className="text-[10px] text-slate-500">kWh</div>
              </div>
              <div className="px-2 border-r border-l border-slate-100">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">הספק</div>
                <div className="text-base font-bold text-slate-900">{site.current_power_kw?.toFixed(1) || 0}</div>
                <div className="text-[10px] text-slate-500">kW</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">קיבולת</div>
                <div className="text-base font-bold text-slate-900">{site.dc_capacity_kwp}</div>
                <div className="text-[10px] text-slate-500">kWp</div>
              </div>
            </div>

            {site.cleaning_recommended && (
              <div className="mt-2 flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg bg-blue-50 text-blue-700">
                <Droplets className="w-3 h-3" />
                <span>מומלץ ניקוי</span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}