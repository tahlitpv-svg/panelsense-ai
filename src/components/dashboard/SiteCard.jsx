import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { MapPin, Zap, Sun, AlertTriangle, WifiOff, Droplets, ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";

const statusConfig = {
  online: { color: "#00ff88", label: "פעיל", glow: "glow-green" },
  warning: { color: "#ffaa00", label: "אזהרה", glow: "glow-amber" },
  offline: { color: "#ff3333", label: "לא מקוון", glow: "pulse-red" },
};

const regionLabels = {
  north: "צפון",
  center: "מרכז",
  south: "דרום",
  arava: "ערבה",
};

export default function SiteCard({ site, index }) {
  const config = statusConfig[site.status] || statusConfig.online;
  const specificYield = site.dc_capacity_kwp > 0
    ? ((site.daily_yield_kwh || 0) / site.dc_capacity_kwp).toFixed(2)
    : "0.00";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <Link to={createPageUrl(`SiteDetail?id=${site.id}`)}>
        <div className={`glass-card rounded-xl p-5 hover:bg-[#242b35] transition-all duration-300 cursor-pointer group ${site.status === "offline" ? "pulse-red" : ""}`}>
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: config.color }} />
              <div>
                <h3 className="text-[#e6edf3] font-semibold text-sm">{site.name}</h3>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-[#8b949e]" />
                  <span className="text-[11px] text-[#8b949e]">{regionLabels[site.region_tag] || site.region_tag}</span>
                </div>
              </div>
            </div>
            <ChevronLeft className="w-4 h-4 text-[#30363d] group-hover:text-[#8b949e] transition-colors" />
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-[#8b949e] mb-1">הספק</p>
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3" style={{ color: config.color }} />
                <span className="text-sm font-semibold text-[#e6edf3] tabular-nums">{(site.current_power_kw || 0).toFixed(1)}</span>
                <span className="text-[10px] text-[#8b949e]">kW</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#8b949e] mb-1">תפוקה</p>
              <div className="flex items-center gap-1">
                <Sun className="w-3 h-3 text-[#ffaa00]" />
                <span className="text-sm font-semibold text-[#e6edf3] tabular-nums">{(site.daily_yield_kwh || 0).toFixed(0)}</span>
                <span className="text-[10px] text-[#8b949e]">kWh</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#8b949e] mb-1">תפוקה סגולית</p>
              <span className="text-sm font-semibold text-[#e6edf3] tabular-nums">{specificYield}</span>
              <span className="text-[10px] text-[#8b949e] mr-0.5">kWh/kWp</span>
            </div>
          </div>

          {/* Capacity bar */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-[#8b949e] mb-1">
              <span>ניצולת</span>
              <span>{site.ac_capacity_kw > 0 ? Math.min(100, Math.round(((site.current_power_kw || 0) / site.ac_capacity_kw) * 100)) : 0}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#30363d] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${site.ac_capacity_kw > 0 ? Math.min(100, ((site.current_power_kw || 0) / site.ac_capacity_kw) * 100) : 0}%`,
                  backgroundColor: config.color
                }}
              />
            </div>
          </div>

          {/* Badges */}
          <div className="flex gap-2 mt-3 flex-wrap">
            {site.cleaning_recommended && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#ffaa00]/10 text-[#ffaa00]">
                <Droplets className="w-3 h-3" /> ניקוי מומלץ
              </span>
            )}
            {site.status === "offline" && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#ff3333]/10 text-[#ff3333]">
                <WifiOff className="w-3 h-3" /> לא מקוון
              </span>
            )}
            {site.status === "warning" && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#ffaa00]/10 text-[#ffaa00]">
                <AlertTriangle className="w-3 h-3" /> תפוקה נמוכה
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}