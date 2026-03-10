import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Save, Trash2, RotateCw, ZoomIn, ZoomOut, Upload, Wand2, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const PANEL_W = 40;
const PANEL_H = 60;
const GRID_SIZE = 10;

function snapToGrid(val) {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

const COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#22c55e', '#eab308'
];

// Realistic solar panel rendering
function SolarPanel({ width, height, color, isSelected, stringId, panelIndex, scale }) {
  const isLandscape = width > height;
  const cols = isLandscape ? 6 : 4;
  const rows = isLandscape ? 4 : 6;
  const colW = (100 / cols).toFixed(2);
  const rowH = (100 / rows).toFixed(2);
  const scaledW = width * scale;
  const scaledH = height * scale;
  const showLabel = scaledW > 28 && scaledH > 22;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: `
          linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px),
          linear-gradient(155deg, #1b3f6e 0%, #0e2248 40%, #071428 100%)
        `,
        backgroundSize: `${colW}% ${rowH}%, ${colW}% ${rowH}%, 100% 100%`,
        border: isSelected
          ? `2px solid #60a5fa`
          : `2px solid ${color}`,
        boxShadow: isSelected
          ? `0 0 0 2px rgba(96,165,250,0.5), 0 0 16px rgba(96,165,250,0.3), inset 0 0 0 1px rgba(200,220,255,0.15)`
          : `inset 0 0 0 1px rgba(200,220,255,0.08), 0 2px 6px rgba(0,0,0,0.6)`,
        overflow: 'hidden',
        cursor: 'grab',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 1,
      }}
    >
      {/* Reflection shimmer */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '30%',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />
      {/* String color strip at bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: Math.max(3, Math.round(5 * scale)),
        backgroundColor: color,
        opacity: 0.85,
      }} />
      {/* Label */}
      {showLabel && (
        <span style={{
          color: 'rgba(255,255,255,0.85)',
          fontSize: Math.max(8, Math.round(10 * scale)),
          fontWeight: 700,
          textShadow: '0 1px 3px rgba(0,0,0,0.9)',
          zIndex: 1,
          letterSpacing: '0.02em',
        }}>
          {stringId}
        </span>
      )}
      {showLabel && scaledH > 36 && (
        <span style={{
          color: 'rgba(200,220,255,0.55)',
          fontSize: Math.max(6, Math.round(8 * scale)),
          textShadow: '0 1px 2px rgba(0,0,0,0.9)',
          zIndex: 1,
          marginTop: 1,
        }}>
          #{panelIndex}
        </span>
      )}
    </div>
  );
}

export default function PanelLayoutEditor() {
  const urlParams = new URLSearchParams(window.location.search);
  const siteId = urlParams.get('siteId');
  const queryClient = useQueryClient();

  const { data: site } = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => base44.entities.Site.filter({ id: siteId }).then(s => s[0]),
    enabled: !!siteId
  });

  const { data: existingLayout } = useQuery({
    queryKey: ['panelLayout', siteId],
    queryFn: () => base44.entities.PanelLayout.filter({ site_id: siteId }).then(l => l[0] || null),
    enabled: !!siteId
  });

  const [panels, setPanels] = useState([]);
  const [selectedPanels, setSelectedPanels] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [imageOpacity, setImageOpacity] = useState(0.55);
  const [blueprintFile, setBlueprintFile] = useState(null);
  const canvasRef = useRef(null);
  const blueprintInputRef = useRef(null);

  useEffect(() => {
    if (existingLayout?.panels) {
      const normalized = existingLayout.panels.map(p => {
        if (p.width > p.height && p.rotation === 0) {
          // keep as is
        }
        return p;
      });
      setPanels(normalized);
    }
  }, [existingLayout]);

  const strings = site?.string_configs || [];
  const totalPanels = strings.reduce((sum, s) => sum + (s.num_panels || 0), 0);

  const stringColors = {};
  strings.forEach((s, i) => {
    stringColors[s.string_id] = COLOR_PALETTE[i % COLOR_PALETTE.length];
  });

  // Mouse drag
  const handleMouseDown = (e, panelId) => {
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    let newSelected = selectedPanels;
    if (e.shiftKey) {
      newSelected = selectedPanels.includes(panelId)
        ? selectedPanels.filter(id => id !== panelId)
        : [...selectedPanels, panelId];
    } else {
      if (!selectedPanels.includes(panelId)) newSelected = [panelId];
    }
    setSelectedPanels(newSelected);

    const offsets = newSelected.map(id => {
      const p = panels.find(x => x.id === id);
      return { id, offsetX: (e.clientX - rect.left) / scale - p.x, offsetY: (e.clientY - rect.top) / scale - p.y };
    });
    setDragging({ offsets });
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setPanels(prev => prev.map(p => {
      const d = dragging.offsets.find(o => o.id === p.id);
      if (d) {
        return { ...p, x: Math.max(0, snapToGrid((e.clientX - rect.left) / scale - d.offsetX)), y: Math.max(0, snapToGrid((e.clientY - rect.top) / scale - d.offsetY)) };
      }
      return p;
    }));
  }, [dragging, scale]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [handleMouseMove, handleMouseUp]);

  const rotatePanel = () => {
    if (!selectedPanels.length) return;
    setPanels(prev => prev.map(p => selectedPanels.includes(p.id) ? { ...p, rotation: p.rotation === 0 ? 90 : 0, width: p.height, height: p.width } : p));
  };

  const rotatePanelId = (id) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, rotation: p.rotation === 0 ? 90 : 0, width: p.height, height: p.width } : p));
  };

  const deletePanel = () => {
    if (!selectedPanels.length) return;
    setPanels(prev => prev.filter(p => !selectedPanels.includes(p.id)));
    setSelectedPanels([]);
  };

  const reassignString = (newStringId) => {
    if (!selectedPanels.length) return;
    let existingCount = panels.filter(p => p.string_id === newStringId).length;
    setPanels(prev => {
      const updated = [...prev];
      selectedPanels.forEach(id => {
        const idx = updated.findIndex(p => p.id === id);
        if (idx !== -1) { updated[idx] = { ...updated[idx], string_id: newStringId, panel_index: ++existingCount }; }
      });
      return updated;
    });
  };

  const handleBlueprintUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBlueprintFile(file);
    const reader = new FileReader();
    reader.onload = (event) => setBackgroundImage(event.target.result);
    reader.readAsDataURL(file);
    if (blueprintInputRef.current) blueprintInputRef.current.value = '';
  };

  const handleAnalyzeBlueprint = async () => {
    if (!blueprintFile) return;
    setIsAnalyzing(true);
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file: blueprintFile });
      if (!uploadRes?.file_url) throw new Error("Failed to upload image");

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert solar panel layout analyzer.

Your task: Identify EVERY solar panel in the image by detecting their RECTANGULAR FRAMES.

HOW TO DETECT PANELS:
Each solar panel has a clear RECTANGULAR FRAME (silver/aluminum/white border outline).
Look for these frames - each distinct frame = one panel.

Visual characteristics:
- FRAME: Distinct rectangular border (silver, white, or light gray outline). This is the key identifier.
- INTERIOR: Dark panel surface (dark blue, black, or charcoal) with faint grid pattern of cells
- ARRANGEMENT: Panels sit in rows/columns forming arrays/strings
- ORIENTATION: Portrait (taller than wide) or Landscape (wider than tall)
- STRINGS: Groups of panels belong to strings, often marked with colored borders or labels like S1, S2

STEP BY STEP:
1. Scan the entire image for rectangular silver/white FRAMES
2. Each frame = one panel - mark its center and orientation
3. Group nearby panels that share a common colored outline or string label
4. Assign string IDs based on grouping or visible labels

Return ONLY JSON with this exact structure (no other text):
{
  "panels": [
    {
      "x_percent": <center X as 0-100% of image width>,
      "y_percent": <center Y as 0-100% of image height>,
      "width_percent": <panel width as 0-100% of image width>,
      "height_percent": <panel height as 0-100% of image height>,
      "is_landscape": <true if wider than tall>,
      "string_id": <e.g. "S1", "S2" - or best guess from grouping>
    }
  ]
}

CRITICAL: Find EVERY frame. Do not skip any panels.`,
        model: "claude_sonnet_4_6",
        file_urls: [uploadRes.file_url],
        response_json_schema: {
          type: "object",
          properties: {
            panels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  x_percent: { type: "number" },
                  y_percent: { type: "number" },
                  width_percent: { type: "number" },
                  height_percent: { type: "number" },
                  is_landscape: { type: "boolean" },
                  string_id: { type: "string" }
                },
                required: ["x_percent", "y_percent", "is_landscape"]
              }
            }
          },
          required: ["panels"]
        }
      });

      if (result?.panels?.length) {
        const canvasW = 1200;
        const canvasH = 800;
        const newPanels = result.panels.map((p, idx) => {
          // Use detected size if available, else default
          let w, h;
          if (p.width_percent && p.height_percent) {
            w = Math.round((p.width_percent / 100) * canvasW);
            h = Math.round((p.height_percent / 100) * canvasH);
            // Normalize to sensible panel sizes
            w = Math.max(PANEL_W, Math.min(w, PANEL_W * 3));
            h = Math.max(PANEL_H, Math.min(h, PANEL_H * 3));
          } else {
            w = p.is_landscape ? PANEL_H : PANEL_W;
            h = p.is_landscape ? PANEL_W : PANEL_H;
          }

          const x = snapToGrid(Math.max(0, (p.x_percent / 100) * canvasW - w / 2));
          const y = snapToGrid(Math.max(0, (p.y_percent / 100) * canvasH - h / 2));

          let matchedString = strings[0]?.string_id || 'S1';
          if (p.string_id) {
            const cleanId = p.string_id.replace(/[^0-9a-zA-Z]/g, '');
            const found = strings.find(s => s.string_id.replace(/[^0-9a-zA-Z]/g, '') === cleanId)
              || strings.find(s => s.string_id.includes(p.string_id.replace(/\D/g, '')));
            if (found) matchedString = found.string_id;
          }

          return {
            id: `ai_${Date.now()}_${idx}`,
            x: Math.min(x, canvasW - w),
            y: Math.min(y, canvasH - h),
            width: w,
            height: h,
            string_id: matchedString,
            panel_index: idx + 1,
            rotation: 0
          };
        });
        setPanels(prev => [...prev, ...newPanels]);
        alert(`✅ זוהו ${newPanels.length} פנלים בהצלחה בעזרת AI!`);
      } else {
        alert("לא נמצאו פנלים בתמונה. נסה תמונה ברורה יותר.");
      }
    } catch (err) {
      console.error(err);
      alert("שגיאה בניתוח התמונה: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const layoutData = { site_id: siteId, panels, canvas_width: 1200, canvas_height: 800 };
    if (existingLayout?.id) {
      await base44.entities.PanelLayout.update(existingLayout.id, layoutData);
    } else {
      await base44.entities.PanelLayout.create(layoutData);
    }
    queryClient.invalidateQueries({ queryKey: ['panelLayout', siteId] });
    setSaving(false);
  };

  if (!site) return <div className="flex items-center justify-center h-screen bg-slate-950 text-slate-400">טוען...</div>;

  const selectedPanel = selectedPanels.length === 1 ? panels.find(p => p.id === selectedPanels[0]) : null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950 text-white overflow-hidden" dir="rtl">
      {/* ── Top Bar ── */}
      <div className="h-12 shrink-0 flex items-center justify-between px-4 bg-slate-900 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('SiteDetails') + `?id=${siteId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-700">
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-sm text-white">{site.name}</span>
            <Badge className="bg-slate-700 text-slate-300 border-0 text-[10px]">{panels.length} פנלים</Badge>
            <Badge className="bg-slate-700 text-slate-300 border-0 text-[10px]">{strings.length} סטרינגים</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom */}
          <div className="flex items-center gap-1 bg-slate-800 rounded-md px-2 py-1">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-white" onClick={() => setScale(s => Math.max(0.3, +(s - 0.1).toFixed(1)))}>
              <ZoomOut className="w-3 h-3" />
            </Button>
            <span className="text-xs text-slate-300 w-10 text-center">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-white" onClick={() => setScale(s => Math.min(2.5, +(s + 0.1).toFixed(1)))}>
              <ZoomIn className="w-3 h-3" />
            </Button>
          </div>

          {/* Blueprint buttons */}
          <input type="file" ref={blueprintInputRef} className="hidden" accept="image/*" onChange={handleBlueprintUpload} />
          {!backgroundImage ? (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-slate-300 hover:text-white hover:bg-slate-700" onClick={() => blueprintInputRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" /> העלה תשריט
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                disabled={isAnalyzing}
                className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleAnalyzeBlueprint}
              >
                <Wand2 className="w-3.5 h-3.5" />
                {isAnalyzing ? 'מפענח...' : 'זהה פנלים AI'}
              </Button>
              {/* Opacity slider */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">שקיפות</span>
                <input type="range" min="0.1" max="1" step="0.05" value={imageOpacity} onChange={e => setImageOpacity(+e.target.value)}
                  className="w-20 h-1 accent-cyan-400" />
              </div>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-slate-700" onClick={() => { setBackgroundImage(null); setBlueprintFile(null); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </>
          )}

          {/* Delete all */}
          <Button variant="ghost" size="sm" className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-slate-700" onClick={() => { if (window.confirm('מחק את כל הפנלים?')) { setPanels([]); setSelectedPanels([]); } }}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>

          {/* Save */}
          <Button size="sm" disabled={saving} className="h-8 bg-green-600 hover:bg-green-500 text-white gap-1.5" onClick={handleSave}>
            <Save className="w-3.5 h-3.5" />
            {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </div>

      {/* ── Main Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: String Palette */}
        <div className="w-[70px] shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col items-center pt-3 pb-3 gap-2 overflow-y-auto">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">סטרינגים</span>
          {strings.map((s, i) => {
            const color = stringColors[s.string_id];
            const count = panels.filter(p => p.string_id === s.string_id).length;
            return (
              <button
                key={s.string_id}
                title={`גרור פנל - ${s.string_id}`}
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('stringId', s.string_id); }}
                className="w-12 h-14 rounded-md flex flex-col items-center justify-center gap-0.5 text-white cursor-grab active:cursor-grabbing transition-transform hover:scale-105 active:scale-95 select-none"
                style={{
                  background: `linear-gradient(155deg, #1b3f6e 0%, #071428 100%)`,
                  border: `2px solid ${color}`,
                  boxShadow: `0 0 8px ${color}44`,
                }}
              >
                <span className="text-[8px] font-bold" style={{ color }}>{s.string_id}</span>
                <span className="text-[7px] text-slate-400">{count}/{s.num_panels || '?'}</span>
              </button>
            );
          })}
        </div>

        {/* Center: Canvas */}
        <div
          className="flex-1 overflow-auto"
          style={{
            background: 'radial-gradient(ellipse at center, #0f1e36 0%, #070e1a 100%)',
          }}
        >
          <div
            ref={canvasRef}
            className="relative"
            style={{
              width: 1200 * scale,
              height: 800 * scale,
              minWidth: '100%',
              minHeight: '100%',
              backgroundImage: backgroundImage
                ? `url('${backgroundImage}')`
                : `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
              backgroundSize: backgroundImage ? 'cover' : `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
              backgroundPosition: 'center',
              cursor: 'crosshair',
            }}
            onClick={() => setSelectedPanels([])}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={(e) => {
              e.preventDefault();
              const stringId = e.dataTransfer.getData('stringId');
              if (!stringId) return;
              const rect = canvasRef.current.getBoundingClientRect();
              const x = snapToGrid((e.clientX - rect.left) / scale - PANEL_W / 2);
              const y = snapToGrid((e.clientY - rect.top) / scale - PANEL_H / 2);
              const newPanel = {
                id: `${stringId}_p${Date.now()}`,
                x: Math.max(0, x),
                y: Math.max(0, y),
                width: PANEL_W,
                height: PANEL_H,
                string_id: stringId,
                panel_index: panels.filter(p => p.string_id === stringId).length + 1,
                rotation: 0
              };
              setPanels(prev => [...prev, newPanel]);
              setSelectedPanels([newPanel.id]);
            }}
          >
            {/* Blueprint overlay for opacity */}
            {backgroundImage && (
              <div style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(7,14,26,${1 - imageOpacity})`, pointerEvents: 'none', zIndex: 1 }} />
            )}

            {/* Panels */}
            {panels.map(panel => {
              const isSelected = selectedPanels.includes(panel.id);
              const color = stringColors[panel.string_id] || '#94a3b8';
              return (
                <div
                  key={panel.id}
                  className="absolute"
                  style={{
                    left: panel.x * scale,
                    top: panel.y * scale,
                    width: panel.width * scale,
                    height: panel.height * scale,
                    zIndex: isSelected ? 20 : 10,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, panel.id)}
                  onDoubleClick={(e) => { e.stopPropagation(); rotatePanelId(panel.id); }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      setSelectedPanels(prev => prev.includes(panel.id) ? prev.filter(id => id !== panel.id) : [...prev, panel.id]);
                    } else {
                      setSelectedPanels([panel.id]);
                    }
                  }}
                >
                  <SolarPanel
                    width={panel.width}
                    height={panel.height}
                    color={color}
                    isSelected={isSelected}
                    stringId={panel.string_id}
                    panelIndex={panel.panel_index}
                    scale={scale}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Properties Panel */}
        <div className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto">
          {selectedPanels.length > 0 ? (
            <div className="p-3 space-y-4">
              <h3 className="font-bold text-sm text-white">
                {selectedPanels.length > 1 ? `${selectedPanels.length} פנלים נבחרו` : 'פנל נבחר'}
              </h3>
              {selectedPanel && (
                <div className="space-y-1 text-xs text-slate-400">
                  <div>סטרינג: <span className="text-white font-medium">{selectedPanel.string_id}</span></div>
                  <div>פנל: <span className="text-white font-medium">#{selectedPanel.panel_index}</span></div>
                  <div>גודל: <span className="text-white font-medium">{selectedPanel.width}×{selectedPanel.height}</span></div>
                </div>
              )}

              <div>
                <label className="text-[11px] text-slate-400 mb-1.5 block">שייך לסטרינג</label>
                <Select value={selectedPanels.length === 1 ? selectedPanel?.string_id : undefined} onValueChange={reassignString}>
                  <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="בחר..." />
                  </SelectTrigger>
                  <SelectContent>
                    {strings.map(s => (
                      <SelectItem key={s.string_id} value={s.string_id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stringColors[s.string_id] }} />
                          {s.string_id}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={rotatePanel}>
                  <RotateCw className="w-3 h-3" /> סובב
                </Button>
                <Button size="sm" className="flex-1 h-8 text-xs gap-1 bg-red-900 hover:bg-red-800 text-red-300 border-0" onClick={deletePanel}>
                  <Trash2 className="w-3 h-3" /> מחק
                </Button>
              </div>

              <p className="text-[10px] text-slate-500">טיפ: לחץ Shift לבחירה מרובה · גרור להזזה · לחץ פעמיים לסיבוב</p>
            </div>
          ) : (
            <div className="p-3 space-y-4">
              <h3 className="font-bold text-sm text-white">מקרא סטרינגים</h3>
              <div className="space-y-2">
                {strings.map(s => {
                  const count = panels.filter(p => p.string_id === s.string_id).length;
                  return (
                    <div key={s.string_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        <div
                          className="w-5 h-4 rounded-sm"
                          style={{
                            background: `linear-gradient(155deg, #1b3f6e 0%, #071428 100%)`,
                            border: `1.5px solid ${stringColors[s.string_id]}`,
                          }}
                        />
                        <span className="text-slate-300">{s.string_id}</span>
                        {s.orientation && <span className="text-slate-500 text-[10px]">{s.orientation}</span>}
                      </div>
                      <span className="text-[10px] text-slate-500">{count}/{s.num_panels || '?'}</span>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-800">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  גרור פנל מהסטרינג לבד השמאלי אל הקנבס.<br />
                  לחץ Shift לבחירה מרובה.<br />
                  לחץ פעמיים לסיבוב פנל.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}