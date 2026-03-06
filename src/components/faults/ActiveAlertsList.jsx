import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, Loader2, Play, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const SEVERITY_CONFIG = {
  critical: { icon: AlertOctagon, color: 'text-red-600', bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700', label: 'קריטי' },
  warning:  { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700', label: 'אזהרה' },
  info:     { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-700', label: 'מידע' }
};

const TYPE_LABELS = {
  low_production: 'ייצור נמוך',
  offline: 'לא מקוון',
  cleaning_recommended: 'ניקוי נדרש',
  inverter_fault: 'תקלת ממיר',
  string_mismatch: 'חוסר התאמת סטרינג',
  phase_voltage_out_of_range: 'מתח פאזה חריג',
  other: 'אחר'
};

export default function ActiveAlertsList() {
  const queryClient = useQueryClient();
  const [runningDetection, setRunningDetection] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: alerts = [], isLoading, refetch } = useQuery({
    queryKey: ['activeAlerts'],
    queryFn: () => base44.entities.Alert.filter({ is_resolved: false }, '-created_date'),
    refetchInterval: 60 * 1000
  });

  const resolveMutation = useMutation({
    mutationFn: (id) => base44.entities.Alert.update(id, {
      is_resolved: true,
      resolved_date: new Date().toISOString()
    }),
    onSuccess: () => queryClient.invalidateQueries(['activeAlerts'])
  });

  const resolveAllMutation = useMutation({
    mutationFn: async () => {
      for (const alert of alerts) {
        await base44.entities.Alert.update(alert.id, {
          is_resolved: true,
          resolved_date: new Date().toISOString()
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries(['activeAlerts'])
  });

  const runDetection = async () => {
    setRunningDetection(true);
    setDetectionResult(null);
    try {
      const res = await base44.functions.invoke('runFaultDetection', {});
      setDetectionResult(res.data);
      queryClient.invalidateQueries(['activeAlerts']);
    } catch (e) {
      setDetectionResult({ error: e.message });
    } finally {
      setRunningDetection(false);
    }
  };

  const filteredAlerts = searchQuery.trim()
    ? alerts.filter(a => a.site_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : alerts;

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-3 py-1.5 rounded-full">
              <AlertOctagon className="w-4 h-4" />
              {criticalCount} קריטיות
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold px-3 py-1.5 rounded-full">
              <AlertTriangle className="w-4 h-4" />
              {warningCount} אזהרות
            </div>
          )}
          {alerts.length === 0 && !isLoading && (
            <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-sm font-semibold px-3 py-1.5 rounded-full">
              <CheckCircle2 className="w-4 h-4" />
              אין התראות פעילות
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            רענן
          </Button>
          <Button
            size="sm"
            onClick={runDetection}
            disabled={runningDetection}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs"
          >
            {runningDetection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {runningDetection ? 'בודק...' : 'הרץ בדיקה עכשיו'}
          </Button>
          {alerts.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => resolveAllMutation.mutate()} disabled={resolveAllMutation.isPending} className="gap-1.5 text-xs text-green-700 border-green-200 hover:bg-green-50">
              <CheckCircle2 className="w-3.5 h-3.5" />
              סגור הכל
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="חיפוש לפי שם אתר..."
          className="pr-9 text-sm"
        />
      </div>

      {/* Detection result */}
      {detectionResult && (
        <Card className={`p-3 text-sm ${detectionResult.error ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
          {detectionResult.error ? (
            <div className="text-red-700">שגיאה: {detectionResult.error}</div>
          ) : (
            <div className="space-y-1">
              <div className="font-semibold text-slate-700">
                תוצאות בדיקה: נבדקו {detectionResult.sites} אתרים, {detectionResult.checked} סוגי תקלות
              </div>
              {detectionResult.triggered?.length > 0 ? (
                <div className="text-red-700 font-medium">
                  זוהו {detectionResult.triggered.length} תקלות:&nbsp;
                  {detectionResult.triggered.map(t => `${t.fault_type} ב${t.site_name}`).join(', ')}
                </div>
              ) : (
                <div className="text-green-700">לא זוהו תקלות חדשות</div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Alerts list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          טוען התראות...
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">כל המערכות תקינות</p>
          <p className="text-slate-400 text-sm mt-1">אין התראות פעילות כרגע</p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">לא נמצאו התראות עבור "{searchQuery}"</div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map(alert => {
            const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.warning;
            const Icon = cfg.icon;
            return (
              <Card key={alert.id} className={`p-4 border ${cfg.bg}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge className={`${cfg.badge} border-0 text-xs`}>{cfg.label}</Badge>
                        <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
                          {TYPE_LABELS[alert.type] || alert.type}
                        </Badge>
                        {alert.fault_type_name && (
                          <span className="text-xs text-slate-500">{alert.fault_type_name}</span>
                        )}
                      </div>
                      <div className="font-semibold text-slate-800 text-sm">{alert.site_name}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{alert.message}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {new Date(alert.created_date).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={createPageUrl(`SiteDetails?id=${alert.site_id}`)}>
                      <Button variant="outline" size="sm" className="text-xs h-7 px-2">לאתר</Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resolveMutation.mutate(alert.id)}
                      disabled={resolveMutation.isPending}
                      className="text-green-700 hover:bg-green-100 h-7 px-2 text-xs gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      סגור
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}