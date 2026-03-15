import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, WifiOff, Droplets, Zap, GitBranch, CheckCircle2, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import moment from "moment";

const alertIcons = {
  low_production: AlertTriangle,
  offline: WifiOff,
  cleaning_recommended: Droplets,
  inverter_fault: Zap,
  string_mismatch: GitBranch,
};

const severityConfig = {
  info:     { bg: "bg-blue-50",  text: "text-blue-700",  border: "border-blue-200"  },
  warning:  { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  critical: { bg: "bg-red-50",   text: "text-red-700",   border: "border-red-200"   },
};

const typeLabels = {
  low_production:       "תפוקה נמוכה",
  offline:              "לא מקוון",
  cleaning_recommended: "ניקוי מומלץ",
  inverter_fault:       "תקלת ממיר",
  string_mismatch:      "חוסר התאמה",
};

export default function Alerts() {
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [showResolved, setShowResolved] = useState(false);
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => base44.entities.Alert.list("-created_date", 100),
    staleTime: 60_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id) =>
      base44.entities.Alert.update(id, {
        is_resolved: true,
        resolved_date: new Date().toISOString(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const filteredAlerts = alerts.filter((a) => {
    if (!showResolved && a.is_resolved) return false;
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">התראות</h1>
          <p className="text-sm text-slate-500 mt-1">
            {alerts.filter((a) => !a.is_resolved).length} התראות פעילות
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" />
        {[
          { v: "all",      l: "הכל"   },
          { v: "critical", l: "קריטי" },
          { v: "warning",  l: "אזהרה" },
          { v: "info",     l: "מידע"  },
        ].map((sev) => (
          <button
            key={sev.v}
            onClick={() => setFilterSeverity(sev.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              filterSeverity === sev.v
                ? "bg-green-50 text-green-700 border-green-200"
                : "text-slate-500 border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            {sev.l}
          </button>
        ))}
        <button
          onClick={() => setShowResolved(!showResolved)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border mr-auto ${
            showResolved
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "text-slate-500 border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          {showResolved ? "הסתר פתורות" : "הצג פתורות"}
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredAlerts.map((alert) => {
            const Icon = alertIcons[alert.type] || AlertTriangle;
            const cfg = severityConfig[alert.severity] || severityConfig.warning;
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className={`p-5 border border-slate-200 shadow-sm bg-white ${alert.is_resolved ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                      <Icon className={`w-5 h-5 ${cfg.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-slate-800">{alert.site_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          {typeLabels[alert.type] || alert.type}
                        </span>
                        {alert.is_resolved && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">
                            נפתר
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{alert.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1.5">
                        {moment(alert.created_date).format("DD/MM/YYYY HH:mm")}
                      </p>
                    </div>
                    {!alert.is_resolved && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resolveMutation.mutate(alert.id)}
                        disabled={resolveMutation.isPending}
                        className="text-slate-400 hover:text-green-600 hover:bg-green-50 shrink-0 gap-1"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs">סמן כנפתר</span>
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredAlerts.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-slate-400 text-sm">אין התראות {!showResolved ? "פעילות" : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}
