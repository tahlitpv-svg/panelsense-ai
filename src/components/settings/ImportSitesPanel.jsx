import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, Download, CheckSquare, Square, X, AlertCircle } from 'lucide-react';

export default function ImportSitesPanel({ conn, onClose }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const connectionId = conn?.id;
  const isSystemSolis = conn === 'solis_system';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['connectionSites', isSystemSolis ? 'solis_system' : connectionId],
    queryFn: async () => {
      const payload = isSystemSolis
        ? { provider: 'solis_system' }
        : { connection_id: connectionId };
      const res = await base44.functions.invoke('fetchConnectionSites', payload);
      return res.data;
    },
    enabled: true,
    staleTime: 60000
  });

  const { data: existingSites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => base44.entities.Site.list()
  });

  const sites = data?.sites || [];

  // Check which sites already exist (by solis_station_id or name)
  const existingIds = new Set(existingSites.map(s => s.solis_station_id).filter(Boolean));
  const isAlreadyImported = (site) => existingIds.has(site.solis_station_id || site.sungrow_station_id);

  const toggleAll = () => {
    const notImported = sites.filter(s => !isAlreadyImported(s)).map(s => s.external_id);
    if (selected.size === notImported.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(notImported));
    }
  };

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    const toImport = sites.filter(s => selected.has(s.external_id));
    if (!toImport.length) return;

    setImporting(true);
    setImportResult(null);
    let success = 0, failed = 0;

    for (const site of toImport) {
      try {
        await base44.entities.Site.create({
          name: site.name,
          dc_capacity_kwp: site.capacity_kwp || 0,
          latitude: site.latitude,
          longitude: site.longitude,
          region_tag: detectRegion(site.latitude),
          solis_station_id: site.solis_station_id || null,
          solis_sno: site.solis_sno || null,
          status: 'online'
        });
        success++;
      } catch (e) {
        failed++;
      }
    }

    await queryClient.invalidateQueries(['sites']);
    await queryClient.invalidateQueries(['connectionSites']);
    setSelected(new Set());
    setImporting(false);
    setImportResult({ success, failed });
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-green-600" />
          <span className="font-semibold text-slate-900 text-sm">
            ייבוא מערכות {isSystemSolis ? '— Solis (מערכת)' : `— ${conn?.name}`}
          </span>
          {!isLoading && sites.length > 0 && (
            <Badge className="bg-slate-100 text-slate-600 border-0">{sites.length} מערכות</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isLoading} className="h-7 w-7 p-0">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          {onClose && (
            <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0">
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading && (
          <div className="flex items-center gap-2 py-6 justify-center text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">טוען מערכות מהספק...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error.message || data?.error || 'שגיאה בטעינת מערכות'}
          </div>
        )}

        {!isLoading && !error && sites.length === 0 && (
          <div className="text-center py-6 text-slate-400 text-sm">לא נמצאו מערכות בחשבון זה</div>
        )}

        {!isLoading && sites.length > 0 && (
          <>
            {/* Select all bar */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors"
              >
                {selected.size === sites.filter(s => !isAlreadyImported(s)).length && selected.size > 0
                  ? <CheckSquare className="w-4 h-4 text-green-600" />
                  : <Square className="w-4 h-4" />
                }
                בחר הכל ({sites.filter(s => !isAlreadyImported(s)).length} זמינים לייבוא)
              </button>
              {selected.size > 0 && (
                <span className="text-xs text-green-700 font-medium">{selected.size} נבחרו</span>
              )}
            </div>

            {/* Sites list */}
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {sites.map(site => {
                const imported = isAlreadyImported(site);
                const isChecked = selected.has(site.external_id);
                return (
                  <div
                    key={site.external_id}
                    onClick={() => !imported && toggle(site.external_id)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer
                      ${imported ? 'bg-green-50 border-green-200 opacity-70 cursor-default' :
                        isChecked ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                  >
                    {imported ? (
                      <Badge className="bg-green-100 text-green-700 border-0 text-[10px] shrink-0">מיובא</Badge>
                    ) : (
                      <Checkbox checked={isChecked} onCheckedChange={() => toggle(site.external_id)} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{site.name}</div>
                      <div className="text-xs text-slate-400 flex gap-2 mt-0.5">
                        {site.capacity_kwp && <span>{site.capacity_kwp} kWp</span>}
                        {site.address && <span className="truncate">{site.address}</span>}
                        <span className="text-slate-300">#{site.external_id}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Import result */}
            {importResult && (
              <div className={`mt-3 text-xs rounded-lg p-2.5 ${importResult.failed > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'}`}>
                יובאו {importResult.success} מערכות בהצלחה{importResult.failed > 0 ? ` • ${importResult.failed} נכשלו` : ' ✓'}
              </div>
            )}

            {/* Import button */}
            {selected.size > 0 && (
              <div className="mt-3">
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="bg-green-600 hover:bg-green-700 gap-2 w-full"
                >
                  {importing
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> מייבא...</>
                    : <><Download className="w-4 h-4" /> ייבא {selected.size} מערכות</>
                  }
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function detectRegion(lat) {
  if (!lat) return 'center';
  if (lat > 32.5) return 'north';
  if (lat > 31.5) return 'center';
  if (lat > 30.0) return 'south';
  return 'arava';
}