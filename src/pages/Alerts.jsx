import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, WifiOff, Droplets, Zap, GitBranch, CheckCircle2, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
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

const typeLabels = {
  low_production: "תפוקה נמוכה",
  offline: "לא מקוון",
  cleaning_recommended: "ניקוי מומלץ",
  inverter_fault: "תקלת ממיר",
  string_mismatch: "חוסר התאמה",
};

export default function Alerts() {
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [showResolved, setShowResolved] = useState(false);
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => base44.entities.Alert.list("-created_date", 100),
  });

  const resolveMutation = useMutation({
    mutationFn: (id) => base44.entities.Alert.update(id, { is_resolved: true, resolved_date: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const filteredAlerts = alerts.filter(a => {
    if (!showResolved && a.is_resolved) return false;
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#00ff88] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">התראות</h1>
          <p className="text-sm text-[#8b949e] mt-1">{alerts.filter(a => !a.is_resolved).length} התראות פעילות</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 text-[#8b949e]">
          <Filter className="w-4 h-4" />
        </div>
        {["all", "critical", "warning", "info"].map(sev => (
          <button
            key={sev}
            onClick={() => setFilterSeverity(sev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${filterSeverity === sev ? "bg-[#00ff88]/10 text-[#00ff88]" : "text-[#8b949e] hover:bg-[#242b35]"}`}
          >
            {sev === "all" ? "הכל" : sev === "critical" ? "קריטי" : sev === "warning" ? "אזהרה" : "מידע"}
          </button>
        ))}
        <button
          onClick={() => setShowResolved(!showResolved)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all mr-auto
            ${showResolved ? "bg-[#58a6ff]/10 text-[#58a6ff]" : "text-[#8b949e] hover:bg-[#242b35]"}`}
        >
          {showResolved ? "הסתר פתורות" : "הצג פתורות"}
        </button>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredAlerts.map((alert) => {
            const Icon = alertIcons[alert.type] || AlertTriangle;
            const color = severityColors[alert.severity] || "#ffaa00";
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`glass-card rounded-xl p-5 ${alert.is_resolved ? "opacity-50" : ""}`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-[#e6edf3]">{alert.site_name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>
                        {typeLabels[alert.type] || alert.type}
                      </span>
                      {alert.is_resolved && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00ff88]/10 text-[#00ff88]">
                          נפתר
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8b949e]">{alert.message}</p>
                    <p className="text-[10px] text-[#8b949e] mt-2">{moment(alert.created_date).format("DD/MM/YYYY HH:mm")}</p>
                  </div>
                  {!alert.is_resolved && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resolveMutation.mutate(alert.id)}
                      className="text-[#8b949e] hover:text-[#00ff88] hover:bg-[#00ff88]/10 flex-shrink-0"
                    >
                      <CheckCircle2 className="w-4 h-4 ml-1" />
                      <span className="text-xs">סמן כנפתר</span>
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredAlerts.length === 0 && (
          <div className="text-center py-16 glass-card rounded-xl">
            <div className="w-14 h-14 rounded-full bg-[#00ff88]/10 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-[#00ff88]" />
            </div>
            <p className="text-[#8b949e] text-sm">אין התראות {!showResolved ? "פעילות" : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}