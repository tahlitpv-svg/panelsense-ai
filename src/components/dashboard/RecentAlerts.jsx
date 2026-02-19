import React from "react";
import { AlertTriangle, WifiOff, Droplets, Zap, GitBranch } from "lucide-react";
import { motion } from "framer-motion";
import moment from "moment";

const alertIcons = {
  low_production: AlertTriangle,
  offline: WifiOff,
  cleaning_recommended: Droplets,
  inverter_fault: Zap,
  string_mismatch: GitBranch,
};

const severityColors = {
  info: "#58a6ff",
  warning: "#ffaa00",
  critical: "#ff3333",
};

export default function RecentAlerts({ alerts }) {
  const recent = alerts
    .filter(a => !a.is_resolved)
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="glass-card rounded-xl p-5"
    >
      <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">התראות אחרונות</h3>
      {recent.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-[#00ff88]/10 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-5 h-5 text-[#00ff88]" />
          </div>
          <p className="text-sm text-[#8b949e]">אין התראות פעילות</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {recent.map((alert, i) => {
            const Icon = alertIcons[alert.type] || AlertTriangle;
            const color = severityColors[alert.severity] || "#ffaa00";
            return (
              <div key={alert.id} className="flex items-start gap-3 p-3 rounded-lg bg-[#0d1117]/50 hover:bg-[#242b35] transition-colors">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#e6edf3] truncate">{alert.site_name}</p>
                  <p className="text-[11px] text-[#8b949e] mt-0.5 line-clamp-1">{alert.message}</p>
                </div>
                <span className="text-[10px] text-[#8b949e] flex-shrink-0 mt-0.5">
                  {moment(alert.created_date).fromNow()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}