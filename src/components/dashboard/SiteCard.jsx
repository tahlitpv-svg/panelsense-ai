import React from 'react';
import { motion } from "framer-motion";
import { MapPin, Zap, AlertTriangle, WifiOff, Sun, Activity, Droplets } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const regionLabels = { north: 'צפון', center: 'מרכז', south: 'דרום', arava: 'ערבה' };

const statusConfig = {
  online: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.2)', label: 'מקוון', dot: '#4ade80' },
  warning: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.2)', label: 'אזהרה', dot: '#fbbf24' },
  offline: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', label: 'לא מקוון', dot: '#f87171' }
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
          className="rounded-xl overflow-hidden transition-all duration-300"
          style={{
            background: 'linear-gradient(135deg, #161c26 0%, #1a2235 100%)',
            border: `1px solid ${config.border}`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}
        >
          {/* Top status bar */}
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${config.color}, transparent)` }} />

          <div className="p-4">
            {/* Header row */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0 ml-2">
                <h3 className="text-white font-bold text-sm truncate leading-tight mb-1">{site.name}</h3>
                <div className="flex items-center gap-1 text-slate-500 text-xs">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span>{regionLabels[site.region_tag] || site.region_tag}</span>
                  {site.num_inverters > 0 && (
                    <span className="mr-2 text-slate-600">• {site.num_inverters} אינוורטרים</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full shrink-0"
                style={{ background: config.bg, border: `1px solid ${config.border}` }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: config.dot, boxShadow: `0 0 6px ${config.dot}` }} />
                <span className="text-xs font-medium" style={{ color: config.color }}>{config.label}</span>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">תפוקה יומית</div>
                <div className="text-base font-bold text-white">{site.daily_yield_kwh?.toFixed(0) || 0}</div>
                <div className="text-[10px] text-green-400/70">kWh</div>
              </div>
              <div style={{ borderRight: '1px solid rgba(255,255,255,0.05)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}
                className="px-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">הספק</div>
                <div className="text-base font-bold text-white">{site.current_power_kw?.toFixed(1) || 0}</div>
                <div className="text-[10px] text-green-400/70">kW</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">קיבולת</div>
                <div className="text-base font-bold text-white">{site.dc_capacity_kwp}</div>
                <div className="text-[10px] text-green-400/70">kWp</div>
              </div>
            </div>

            {site.cleaning_recommended && (
              <div className="mt-2 flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg"
                style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
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