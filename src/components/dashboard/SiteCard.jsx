import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { MapPin, Zap, TrendingUp, AlertTriangle, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const statusConfig = {
  online: { 
    color: '#00ff88', 
    bg: '#00ff8820', 
    icon: Zap, 
    label: 'מקוון',
    pulse: false 
  },
  warning: { 
    color: '#ffaa00', 
    bg: '#ffaa0020', 
    icon: AlertTriangle, 
    label: 'אזהרה',
    pulse: true 
  },
  offline: { 
    color: '#ff3333', 
    bg: '#ff333320', 
    icon: WifiOff, 
    label: 'לא מקוון',
    pulse: true 
  }
};

export default function SiteCard({ site, regionalAverage }) {
  const config = statusConfig[site.status] || statusConfig.online;
  const StatusIcon = config.icon;
  const performance = site.dc_capacity_kwp > 0 
    ? ((site.specific_yield_kwh_kwp / regionalAverage) * 100).toFixed(0) 
    : 100;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3 }}
    >
      <Link to={createPageUrl(`SiteDetails?id=${site.id}`)}>
        <Card 
          className="relative overflow-hidden border-0 shadow-xl cursor-pointer transition-all"
          style={{
            background: 'linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)',
            borderTop: `3px solid ${config.color}`,
            ...(config.pulse && {
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            })
          }}
        >
          <div className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-1">{site.name}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <MapPin className="w-3 h-3" />
                  <span>{site.region_tag === 'north' ? 'צפון' : site.region_tag === 'center' ? 'מרכז' : site.region_tag === 'south' ? 'דרום' : 'ערבה'}</span>
                </div>
              </div>
              <div className="p-2 rounded-lg" style={{ backgroundColor: config.bg }}>
                <StatusIcon className="w-5 h-5" style={{ color: config.color }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-black/30 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">הספק נוכחי</div>
                <div className="text-xl font-bold text-white">{site.current_power_kw?.toFixed(1) || 0}</div>
                <div className="text-xs text-gray-400">kW</div>
              </div>
              <div className="bg-black/30 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">יומי</div>
                <div className="text-xl font-bold text-white">{site.daily_yield_kwh?.toFixed(0) || 0}</div>
                <div className="text-xs text-gray-400">kWh</div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Badge 
                className="border-0 text-xs font-medium"
                style={{ 
                  backgroundColor: config.bg,
                  color: config.color 
                }}
              >
                {config.label}
              </Badge>
              {site.cleaning_recommended && (
                <Badge className="bg-amber-500/20 text-amber-400 border-0 text-xs">
                  דורש ניקוי
                </Badge>
              )}
            </div>

            {site.status === 'warning' && (
              <div className="mt-3 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-amber-400">ביצועים: {performance}% מהממוצע האזורי</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}