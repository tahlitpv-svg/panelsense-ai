import React, { useState, useMemo } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ZoomIn, ZoomOut, Pencil, Grid3X3, Maximize2 } from "lucide-react";

function getProductionColor(wattage, maxWattage) {
  if (!wattage || wattage <= 0) return '#183b78';
  const ratio = maxWattage > 0 ? wattage / maxWattage : 0;
  if (ratio >= 0.85) return '#4f8dff';
  if (ratio >= 0.7) return '#3f7df2';
  if (ratio >= 0.55) return '#346ddc';
  if (ratio >= 0.4) return '#295fc5';
  if (ratio >= 0.25) return '#234fa8';
  return '#1d438f';
}

function hexToRgba(hex, alpha) {
  if (!hex?.startsWith('#')) return `rgba(15,23,42,${alpha})`;
  const value = hex.replace('#', '');
  const normalized = value.length === 3 ? value.split('').map((char) => char + char).join('') : value;
  const int = parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizePortToken(value = '') {
  return value.toString().toUpperCase().replace(/\s+/g, '').replace(/[()_-]/g, '');
}

function extractPortNumber(value = '') {
  const match = value.toString().toUpperCase().match(/PV\s*(\d+)|(\d+)/);
  return match ? Number(match[1] || match[2]) : null;
}

function buildPortCandidates(config) {
  const digits = (config?.inverter_port || config?.string_id || '').toString().replace(/\D/g, '');
  const candidates = new Set([
    config?.inverter_port,
    config?.string_id,
    digits,
    digits ? `PV${digits}` : null,
    digits ? `MPPT${digits}` : null,
    digits ? `STR${digits}` : null,
  ].filter(Boolean).map(normalizePortToken));
  return Array.from(candidates);
}

function findMatchingMppt(mpptEntries, config) {
  const candidates = buildPortCandidates(config);
  const configPortNumber = extractPortNumber(config?.inverter_port || config?.string_id || '');

  for (const [key, mppt] of mpptEntries) {
    const normalizedKey = normalizePortToken(key);
    const keyPortNumber = extractPortNumber(key);
    const matched = candidates.find((candidate) =>
      normalizedKey === candidate ||
      normalizedKey.startsWith(candidate) ||
      (candidate.length >= 3 && normalizedKey.includes(candidate))
    );

    if (matched) return { key, mppt };
    if (configPortNumber && keyPortNumber && configPortNumber === keyPortNumber) {
      return { key, mppt };
    }
  }
  return null;
}

export default function PanelLayoutView({ site, inverters }) {
  const siteId = site?.id;
  const [zoom, setZoom] = useState(0.8);
  const [showWatts, setShowWatts] = useState(true);
  const stringColors = Object.fromEntries((site?.string_configs || []).map((s, i) => [s.string_id, ['#7dc6e8', '#7ecb9a', '#e8c36d', '#e59aa0', '#b8a7e8', '#e7a8c7', '#79d7df', '#b7d97a', '#e8b07d', '#94b8e8'][i % 10]]));

  const { data: layout } = useQuery({
    queryKey: ['panelLayout', siteId],
    queryFn: () => base44.entities.PanelLayout.filter({ site_id: siteId }).then(l => l[0] || null),
    enabled: !!siteId
  });

  // Calculate per-panel wattage from MPPT string data
  const panelData = useMemo(() => {
    if (!layout?.panels?.length) return {};
    const strings = site?.string_configs || [];
    const result = {};

    const mpptEntries = [];
    inverters.forEach((inv) => {
      (inv.mppt_strings || []).forEach((mppt) => {
        if (mppt?.string_id) mpptEntries.push([mppt.string_id, mppt]);
      });
    });

    strings.forEach((sc) => {
      const stringPanels = layout.panels.filter((p) => p.string_id === sc.string_id);
      const numPanels = sc.num_panels || stringPanels.length || 1;
      const match = findMatchingMppt(mpptEntries, sc);
      const livePowerFromKw = (match?.mppt?.power_kw || 0) * 1000;
      const livePowerFromVoltage = (match?.mppt?.voltage_v || 0) * (match?.mppt?.current_a || 0);
      const livePowerFromExpectedVoltage = (sc.expected_voltage || 0) * (match?.mppt?.current_a || 0);
      const totalStringPowerW = match
        ? Math.round(Math.max(livePowerFromKw, livePowerFromVoltage, livePowerFromExpectedVoltage, 0))
        : 0;
      const perPanelW = numPanels > 0 ? totalStringPowerW / numPanels : 0;

      stringPanels.forEach((p) => {
        result[p.id] = {
          watts: Math.round(perPanelW),
          string_id: sc.string_id,
          inverter_port: sc.inverter_port || null,
          matched_port: match?.key || null,
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

  const stageScale = zoom * (layout?.background_scale || 1);

  // Calculate total and per-string stats
  const stringStats = (site?.string_configs || []).reduce((acc, sc) => {
    acc[sc.string_id] = { total: 0, count: 0, inverter_port: sc.inverter_port || '—', matched_port: null };
    return acc;
  }, {});

  Object.values(panelData).forEach((d) => {
    if (!stringStats[d.string_id]) {
      stringStats[d.string_id] = { total: 0, count: 0, inverter_port: d.inverter_port || '—', matched_port: null };
    }
    stringStats[d.string_id].total += d.watts;
    stringStats[d.string_id].count++;
    if (d.matched_port) stringStats[d.string_id].matched_port = d.matched_port;
  });

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white" style={{ direction: 'ltr' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 flex-wrap gap-2" dir="rtl">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm text-slate-900">לייאאוט פנלים - Live</h3>
          <Badge className="text-[10px] bg-green-50 text-green-700 border-green-200 border">
            {Object.values(panelData).filter(d => d.watts > 0).length}/{layout.panels.length} פעיל
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-600 hover:text-slate-900" onClick={() => setShowWatts(!showWatts)}>
            {showWatts ? 'הסתר ואט' : 'הצג ואט'}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-600 hover:text-slate-900" onClick={() => setZoom(z => Math.max(0.3, +(z - 0.1).toFixed(1)))}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[10px] text-slate-500 w-8 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-600 hover:text-slate-900" onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1)))}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Link to={createPageUrl('PanelLayoutEditor') + `?siteId=${siteId}`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-slate-600 hover:text-slate-900">
              <Maximize2 className="w-3 h-3" /> מסך מלא
            </Button>
          </Link>
          <Link to={createPageUrl('PanelLayoutEditor') + `?siteId=${siteId}`}>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-slate-600 hover:text-slate-900">
              <Pencil className="w-3 h-3" /> ערוך
            </Button>
          </Link>
        </div>
      </div>

      {/* Canvas */}
      <div className="overflow-auto bg-slate-100" style={{ maxHeight: 650 }}>
        <div className="min-w-full min-h-full flex justify-center items-start p-6">
        <div
          className="relative shrink-0"
          style={{
            width: (layout.canvas_width || 1200) * stageScale,
            height: (layout.canvas_height || 800) * stageScale,
            backgroundColor: '#ffffff',
            backgroundImage: layout.background_image_url
              ? 'none'
              : `linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)`,
            backgroundSize: `${20 * stageScale}px ${20 * stageScale}px`,
            backgroundRepeat: 'repeat',
            backgroundPosition: 'top left',
          }}
        >
          {layout.background_image_url && (
            <>
              <img
                src={layout.background_image_url}
                alt="Simulation"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
              />
              <div style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(255,255,255,${1 - (layout.background_opacity ?? 0.85)})`, pointerEvents: 'none' }} />
            </>
          )}
          {layout.panels.map(p => {
            const data = panelData[p.id] || { watts: 0, string_id: p.string_id };
            const productionColor = getProductionColor(data.watts, maxWatts);
            const stringColor = stringColors[p.string_id] || '#94a3b8';
            const subtleStringColor = hexToRgba(stringColor, 0.035);
            const strongStringColor = hexToRgba(stringColor, 0.38);
            const isLandscape = p.width > p.height;
            const cols = isLandscape ? 6 : 4;
            const rows = isLandscape ? 4 : 6;
            const colW = (100 / cols).toFixed(2);
            const rowH = (100 / rows).toFixed(2);
            const scaledW = p.width * stageScale;
            const scaledH = p.height * stageScale;
            const showLabel = scaledW > 22 && scaledH > 18;
            const borderColor = strongStringColor;

            return (
              <div
                key={p.id}
                className="absolute overflow-hidden"
                style={{
                  left: p.x * stageScale,
                  top: p.y * stageScale,
                  width: scaledW,
                  height: scaledH,
                  background: `
                    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px),
                    linear-gradient(180deg, ${productionColor} 0%, ${productionColor} 100%)
                  `,
                  backgroundSize: `${colW}% ${rowH}%, ${colW}% ${rowH}%, 100% 100%`,
                  border: `2.5px solid ${stringColor}`,
                  boxShadow: `0 0 0 1px ${hexToRgba(stringColor, 0.28)}`,
                  outline: `1px solid ${hexToRgba(stringColor, 0.18)}`,
                  opacity: 1,
                  borderRadius: 1,
                }}
                title={`${p.string_id} #${p.panel_index}: ${data.watts > 0 ? data.watts + 'W' : 'לא מייצר'}`}
              >
                {/* Reflection shimmer */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '30%', background: 'linear-gradient(180deg,rgba(255,255,255,0.06) 0%,transparent 100%)', pointerEvents: 'none' }} />
                {/* Production color strip at bottom */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.max(2, Math.round(4 * stageScale)), backgroundColor: hexToRgba(stringColor, 0.16), }} />
                {/* Labels */}
                {showLabel && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: Math.max(2, Math.round(5 * zoom)) }}>
                    {showWatts && data.watts > 0 ? (
                      <>
                        <span style={{ color: '#ffffff', fontSize: Math.max(7, Math.round(10 * stageScale)), fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.95)', lineHeight: 1 }}>
                          {data.watts}
                        </span>
                        {scaledH > 36 && (
                          <span style={{ color: 'rgba(200,220,255,0.4)', fontSize: Math.max(5, Math.round(7 * stageScale)), lineHeight: 1, marginTop: 1 }}>W</span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: '#ffffff', fontSize: Math.max(7, Math.round(9 * stageScale)), fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.95)', lineHeight: 1 }}>
                        {p.string_id}
                      </span>
                    )}
                    {scaledH > 40 && (
                      <span style={{ color: 'rgba(200,220,255,0.35)', fontSize: Math.max(5, Math.round(6 * stageScale)), lineHeight: 1, marginTop: 1 }}>
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
      </div>

      {/* Footer / Legend */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-t border-slate-200 flex-wrap gap-2" dir="rtl">
        <div className="flex items-center gap-3 text-[10px] flex-wrap">
          {[['#22d3ee','גבוה'],['#0ea5e9','טוב'],['#3b82f6','בינוני'],['#8b5cf6','חלש'],['rgba(100,120,150,0.4)','לא מייצר']].map(([c, label]) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-5 h-3 rounded-sm" style={{
                background: `linear-gradient(155deg, #1b3f6e, #071428)`,
                border: `1.5px solid ${c}`,
              }} />
              <span className="text-slate-500">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3 text-[10px] flex-wrap">
          {Object.entries(stringStats).map(([sid, stat]) => (
            <span key={sid} className="text-slate-500">
              {sid} • {stat.inverter_port} • <span className="font-medium text-slate-900">{(stat.total / 1000).toFixed(1)}kW</span>
              {stat.matched_port ? <span className="text-slate-500"> • מזוהה כ-{stat.matched_port}</span> : <span className="text-amber-500"> • לא זוהתה יציאה</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}