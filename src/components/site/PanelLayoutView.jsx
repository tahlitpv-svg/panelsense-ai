import React, { useState, useMemo } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ZoomIn, ZoomOut, Pencil, Grid3X3 } from "lucide-react";

function getPanelColor(wattage, maxWattage) {
  if (!wattage || wattage <= 0) return { bg: '#1e293b', border: '#334155', text: '#94a3b8' }; // dark/offline
  const ratio = maxWattage > 0 ? wattage / maxWattage : 0;
  if (ratio >= 0.8) return { bg: '#1e3a5f', border: '#2563eb', text: '#ffffff' }; // dark blue = great
  if (ratio >= 0.6) return { bg: '#2563eb', border: '#3b82f6', text: '#ffffff' }; // medium blue
  if (ratio >= 0.4) return { bg: '#60a5fa', border: '#93c5fd', text: '#1e3a5f' }; // light blue
  if (ratio >= 0.2) return { bg: '#93c5fd', border: '#bfdbfe', text: '#1e3a5f' }; // very light blue
  return { bg: '#fca5a5', border: '#f87171', text: '#7f1d1d' }; // red = very low
}

export default function PanelLayoutView({ site, inverters }) {
  const siteId = site?.id;
  const [zoom, setZoom] = useState(0.8);
  const [showWatts, setShowWatts] = useState(true);

  const { data: layout } = useQuery({
    queryKey: ['panelLayout', siteId],
    queryFn: () => base44.entities.PanelLayout.filter({ site_id: siteId }).then(l => l[0] || null),
    enabled: !!siteId
  });

  // Calculate per-panel wattage from MPPT string data
  const panelData = useMemo(() => {
    if (!layout?.panels || !inverters?.length) return {};
    const strings = site?.string_configs || [];
    const result = {};

    // Gather all MPPT data from inverters
    const mpptMap = {};
    inverters.forEach(inv => {
      (inv.mppt_strings || []).forEach(mppt => {
        mpptMap[mppt.string_id] = mppt;
      });
    });

    // For each string, calculate per-panel wattage
    strings.forEach(sc => {
      const stringPanels = layout.panels.filter(p => p.string_id === sc.string_id);
      const numPanels = sc.num_panels || stringPanels.length || 1;

      // Find matching MPPT - try exact match or partial match
      let mppt = null;
      const possibleIds = [sc.string_id, sc.string_id?.replace('S', 'PV'), `PV${sc.string_id?.replace(/\D/g, '')}`];
      for (const pid of possibleIds) {
        if (mpptMap[pid]) { mppt = mpptMap[pid]; break; }
      }

      // Total string power in watts
      const totalStringPowerW = mppt ? (mppt.power_kw || 0) * 1000 : 0;
      const perPanelW = numPanels > 0 ? totalStringPowerW / numPanels : 0;

      stringPanels.forEach(p => {
        result[p.id] = {
          watts: Math.round(perPanelW),
          string_id: sc.string_id
        };
      });
    });

    return result;
  }, [layout, inverters, site]);

  // Find max watts for color scaling
  const maxWatts = useMemo(() => {
    const vals = Object.values(panelData).map(d => d.watts).filter(w => w > 0);
    return vals.length > 0 ? Math.max(...vals) : (site?.panel_watt || 400);
  }, [panelData, site]);

  if (!layout?.panels?.length) {
    return (
      <Card className="p-6 border border-slate-200 bg-white text-center">
        <Grid3X3 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500 mb-3">לא הוגדר לייאאוט פנלים לאתר זה</p>
        <Link to={createPageUrl('PanelLayoutEditor') + `&siteId=${siteId}`}>
          <Button variant="outline" className="gap-2 text-sm">
            <Pencil className="w-3.5 h-3.5" />
            צור לייאאוט
          </Button>
        </Link>
      </Card>
    );
  }

  // Calculate total and per-string stats
  const stringStats = {};
  Object.values(panelData).forEach(d => {
    if (!stringStats[d.string_id]) stringStats[d.string_id] = { total: 0, count: 0 };
    stringStats[d.string_id].total += d.watts;
    stringStats[d.string_id].count++;
  });

  return (
    <Card className="border border-slate-200 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm text-slate-700">לייאאוט פנלים - Live</h3>
          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
            {Object.values(panelData).filter(d => d.watts > 0).length}/{layout.panels.length} פעיל
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowWatts(!showWatts)}>
            {showWatts ? 'הסתר ואט' : 'הצג ואט'}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[10px] text-slate-400 w-8 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Link to={createPageUrl('PanelLayoutEditor') + `&siteId=${siteId}`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
              <Pencil className="w-3 h-3" /> ערוך
            </Button>
          </Link>
        </div>
      </div>

      {/* Canvas */}
      <div className="overflow-auto p-2" style={{ maxHeight: 600 }}>
        <div
          className="relative mx-auto"
          style={{
            width: (layout.canvas_width || 1200) * zoom,
            height: (layout.canvas_height || 800) * zoom,
            backgroundColor: '#f8fafc'
          }}
        >
          {layout.panels.map(panel => {
            const data = panelData[panel.id] || { watts: 0, string_id: panel.string_id };
            const color = getPanelColor(data.watts, maxWatts);
            return (
              <div
                key={panel.id}
                className="absolute flex flex-col items-center justify-center border rounded-sm transition-all"
                style={{
                  left: panel.x * zoom,
                  top: panel.y * zoom,
                  width: panel.width * zoom,
                  height: panel.height * zoom,
                  backgroundColor: color.bg,
                  borderColor: color.border,
                  transform: panel.rotation ? `rotate(${panel.rotation}deg)` : undefined,
                }}
                title={`${panel.string_id} #${panel.panel_index}: ${data.watts}W`}
              >
                {showWatts && (
                  <>
                    <span className="font-bold leading-none" style={{ color: color.text, fontSize: Math.max(7, 10 * zoom) }}>
                      {data.watts > 0 ? data.watts : '—'}
                    </span>
                    {zoom >= 0.6 && (
                      <span className="leading-none opacity-80" style={{ color: color.text, fontSize: Math.max(5, 7 * zoom) }}>
                        {data.watts > 0 ? 'Wh' : ''}
                      </span>
                    )}
                  </>
                )}
                {zoom >= 0.7 && (
                  <span className="leading-none opacity-60 mt-0.5" style={{ color: color.text, fontSize: Math.max(5, 6 * zoom) }}>
                    {panel.string_id}.{panel.panel_index}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between p-3 border-t border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[10px] flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#1e3a5f' }} />
            <span className="text-slate-500">ייצור גבוה</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#2563eb' }} />
            <span className="text-slate-500">טוב</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#93c5fd' }} />
            <span className="text-slate-500">חלש</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#fca5a5' }} />
            <span className="text-slate-500">נמוך מאוד</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#1e293b' }} />
            <span className="text-slate-500">לא מייצר</span>
          </div>
        </div>
        <div className="flex gap-3 text-[10px] flex-wrap">
          {Object.entries(stringStats).map(([sid, stat]) => (
            <span key={sid} className="text-slate-500">
              {sid}: <span className="font-medium text-slate-700">{(stat.total / 1000).toFixed(1)}kW</span>
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}