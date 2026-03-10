import React, { useState, useMemo } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ZoomIn, ZoomOut, Pencil, Grid3X3 } from "lucide-react";

function getProductionColor(wattage, maxWattage) {
  if (!wattage || wattage <= 0) return null; // no production - show dark panel
  const ratio = maxWattage > 0 ? wattage / maxWattage : 0;
  if (ratio >= 0.8) return '#22d3ee'; // cyan
  if (ratio >= 0.6) return '#0ea5e9'; // sky
  if (ratio >= 0.4) return '#3b82f6'; // blue
  if (ratio >= 0.2) return '#6366f1'; // indigo
  return '#8b5cf6'; // violet (very low)
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
      const possibleIds = [sc.inverter_port, sc.string_id, sc.string_id?.replace('S', 'PV'), `PV${sc.string_id?.replace(/\D/g, '')}`].filter(Boolean);
      for (const pid of possibleIds) {
        if (mpptMap[pid]) { mppt = mpptMap[pid]; break; }
      }
      
      // Try partial match if not found (e.g. user typed "PV6", api has "PV6 (MPPT3 Str2)")
      if (!mppt && sc.inverter_port) {
        const partialMatch = Object.keys(mpptMap).find(k => 
          k.toLowerCase().startsWith(sc.inverter_port.toLowerCase() + ' ') || 
          k.toLowerCase() === sc.inverter_port.toLowerCase()
        );
        if (partialMatch) mppt = mpptMap[partialMatch];
      }

      // Total string power in watts (V * A)
      const totalStringPowerW = mppt ? (mppt.voltage_v || 0) * (mppt.current_a || 0) : 0;
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
        <Link to={createPageUrl('PanelLayoutEditor') + `?siteId=${siteId}`}>
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
    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950" style={{ direction: 'ltr' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-wrap gap-2" dir="rtl">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm text-white">לייאאוט פנלים - Live</h3>
          <Badge className="text-[10px] bg-green-900/60 text-green-400 border-green-700 border">
            {Object.values(panelData).filter(d => d.watts > 0).length}/{layout.panels.length} פעיל
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-300 hover:text-white" onClick={() => setShowWatts(!showWatts)}>
            {showWatts ? 'הסתר ואט' : 'הצג ואט'}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-white" onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(1)))}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[10px] text-slate-400 w-8 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-white" onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1)))}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Link to={createPageUrl('PanelLayoutEditor') + `?siteId=${siteId}`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-slate-300 hover:text-white">
              <Pencil className="w-3 h-3" /> ערוך
            </Button>
          </Link>
        </div>
      </div>

      {/* Canvas */}
      <div className="overflow-auto" style={{ maxHeight: 650, background: 'radial-gradient(ellipse at center, #0f1e36 0%, #070e1a 100%)' }}>
        <div
          className="relative"
          style={{
            width: (layout.canvas_width || 1200) * zoom,
            height: (layout.canvas_height || 800) * zoom,
            minWidth: '100%',
            backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          }}
        >
          {layout.panels.map(p => {
            const data = panelData[p.id] || { watts: 0, string_id: p.string_id };
            const productionColor = getProductionColor(data.watts, maxWatts);
            const isLandscape = p.width > p.height;
            const cols = isLandscape ? 6 : 4;
            const rows = isLandscape ? 4 : 6;
            const colW = (100 / cols).toFixed(2);
            const rowH = (100 / rows).toFixed(2);
            const scaledW = p.width * zoom;
            const scaledH = p.height * zoom;
            const showLabel = scaledW > 22 && scaledH > 18;
            const borderColor = productionColor || 'rgba(100,120,150,0.5)';

            return (
              <div
                key={p.id}
                className="absolute overflow-hidden"
                style={{
                  left: p.x * zoom,
                  top: p.y * zoom,
                  width: scaledW,
                  height: scaledH,
                  background: `
                    linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px),
                    linear-gradient(155deg, #1b3f6e 0%, #0e2248 40%, #071428 100%)
                  `,
                  backgroundSize: `${colW}% ${rowH}%, ${colW}% ${rowH}%, 100% 100%`,
                  border: `1.5px solid ${borderColor}`,
                  boxShadow: productionColor
                    ? `0 0 8px ${productionColor}44, inset 0 0 0 1px rgba(200,220,255,0.1)`
                    : `inset 0 0 0 1px rgba(100,120,150,0.1)`,
                  borderRadius: 1,
                }}
                title={`${p.string_id} #${p.panel_index}: ${data.watts > 0 ? data.watts + 'W' : 'לא מייצר'}`}
              >
                {/* Reflection shimmer */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '30%', background: 'linear-gradient(180deg,rgba(255,255,255,0.06) 0%,transparent 100%)', pointerEvents: 'none' }} />
                {/* Production color strip at bottom */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.max(2, Math.round(4 * zoom)), backgroundColor: productionColor || 'rgba(100,120,150,0.3)', }} />
                {/* Labels */}
                {showLabel && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: Math.max(2, Math.round(5 * zoom)) }}>
                    {showWatts && data.watts > 0 ? (
                      <>
                        <span style={{ color: productionColor || 'rgba(200,220,255,0.6)', fontSize: Math.max(7, Math.round(10 * zoom)), fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.9)', lineHeight: 1 }}>
                          {data.watts}
                        </span>
                        {scaledH > 36 && (
                          <span style={{ color: 'rgba(200,220,255,0.4)', fontSize: Math.max(5, Math.round(7 * zoom)), lineHeight: 1, marginTop: 1 }}>W</span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: 'rgba(200,220,255,0.55)', fontSize: Math.max(7, Math.round(9 * zoom)), fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.9)', lineHeight: 1 }}>
                        {p.string_id}
                      </span>
                    )}
                    {scaledH > 40 && (
                      <span style={{ color: 'rgba(200,220,255,0.35)', fontSize: Math.max(5, Math.round(6 * zoom)), lineHeight: 1, marginTop: 1 }}>
                        #{p.panel_index}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer / Legend */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex-wrap gap-2" dir="rtl">
        <div className="flex items-center gap-3 text-[10px] flex-wrap">
          {[['#22d3ee','גבוה'],['#0ea5e9','טוב'],['#3b82f6','בינוני'],['#8b5cf6','חלש'],['rgba(100,120,150,0.4)','לא מייצר']].map(([c, label]) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-5 h-3 rounded-sm" style={{
                background: `linear-gradient(155deg, #1b3f6e, #071428)`,
                border: `1.5px solid ${c}`,
              }} />
              <span className="text-slate-400">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3 text-[10px] flex-wrap">
          {Object.entries(stringStats).map(([sid, stat]) => (
            <span key={sid} className="text-slate-400">
              {sid}: <span className="font-medium text-white">{(stat.total / 1000).toFixed(1)}kW</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}