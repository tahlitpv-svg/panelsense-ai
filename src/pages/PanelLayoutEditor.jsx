import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Save, Plus, Trash2, RotateCw, Grid3X3, MousePointer2, ZoomIn, ZoomOut, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const PANEL_W = 40;
const PANEL_H = 60;
const GRID_SIZE = 10;

function snapToGrid(val) {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
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
  const [selectedPanel, setSelectedPanel] = useState(null);
  const [activeString, setActiveString] = useState('');
  const [dragging, setDragging] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [imageOpacity, setImageOpacity] = useState(0.5);
  const [imageScale, setImageScale] = useState(1);
  const blueprintInputRef = useRef(null);

  // Load existing layout
  useEffect(() => {
    if (existingLayout?.panels) {
      const flipped = existingLayout.panels.map(p => {
        if (p.width > p.height) {
          return { ...p, width: p.height, height: p.width };
        }
        return p;
      });
      setPanels(flipped);
    }
  }, [existingLayout]);

  const strings = site?.string_configs || [];
  const totalPanels = strings.reduce((sum, s) => sum + (s.num_panels || 0), 0);

  // Generate panels for a string
  const generateStringPanels = useCallback((stringConfig) => {
    const count = stringConfig.num_panels || 0;
    const existingForString = panels.filter(p => p.string_id === stringConfig.string_id);
    if (existingForString.length >= count) return;

    const newPanels = [];
    const startIdx = existingForString.length;
    for (let i = startIdx; i < count; i++) {
      const col = i % 8;
      const row = Math.floor(i / 8);
      newPanels.push({
        id: `${stringConfig.string_id}_p${i + 1}`,
        x: snapToGrid(100 + col * (PANEL_W + 10)),
        y: snapToGrid(100 + row * (PANEL_H + 10)),
        width: PANEL_W,
        height: PANEL_H,
        string_id: stringConfig.string_id,
        panel_index: i + 1,
        rotation: 0
      });
    }
    setPanels(prev => [...prev, ...newPanels]);
  }, [panels]);

  // Generate all panels
  const generateAllPanels = useCallback(() => {
    const allNew = [];
    let globalIdx = 0;
    strings.forEach(sc => {
      const count = sc.num_panels || 0;
      for (let i = 0; i < count; i++) {
        const col = globalIdx % 10;
        const row = Math.floor(globalIdx / 10);
        allNew.push({
          id: `${sc.string_id}_p${i + 1}`,
          x: snapToGrid(50 + col * (PANEL_W + 10)),
          y: snapToGrid(50 + row * (PANEL_H + 10)),
          width: PANEL_W,
          height: PANEL_H,
          string_id: sc.string_id,
          panel_index: i + 1,
          rotation: 0
        });
        globalIdx++;
      }
    });
    setPanels(allNew);
  }, [strings]);

  // Mouse handling for drag
  const handleMouseDown = (e, panelId) => {
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    setDragging({
      id: panelId,
      offsetX: (e.clientX - rect.left) / zoom - panel.x,
      offsetY: (e.clientY - rect.top) / zoom - panel.y
    });
    setSelectedPanel(panelId);
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = snapToGrid((e.clientX - rect.left) / zoom - dragging.offsetX);
    const y = snapToGrid((e.clientY - rect.top) / zoom - dragging.offsetY);
    setPanels(prev => prev.map(p => p.id === dragging.id ? { ...p, x: Math.max(0, x), y: Math.max(0, y) } : p));
  }, [dragging, zoom]);

  const handleMouseUp = useCallback((e) => {
    // If we only clicked without dragging, we should still ensure the panel is selected
    // but the mousedown already handles selection. We just clear dragging state.
    setDragging(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Touch handling for mobile
  const handleTouchStart = (e, panelId) => {
    e.stopPropagation();
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    setDragging({
      id: panelId,
      offsetX: (touch.clientX - rect.left) / zoom - panel.x,
      offsetY: (touch.clientY - rect.top) / zoom - panel.y
    });
    setSelectedPanel(panelId);
  };

  const handleTouchMove = useCallback((e) => {
    if (!dragging || !canvasRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const x = snapToGrid((touch.clientX - rect.left) / zoom - dragging.offsetX);
    const y = snapToGrid((touch.clientY - rect.top) / zoom - dragging.offsetY);
    setPanels(prev => prev.map(p => p.id === dragging.id ? { ...p, x: Math.max(0, x), y: Math.max(0, y) } : p));
  }, [dragging, zoom]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  }, [handleTouchMove]);

  // Rotate selected panel
  const rotatePanel = () => {
    if (!selectedPanel) return;
    rotatePanelId(selectedPanel);
  };

  const rotatePanelId = (id) => {
    setPanels(prev => prev.map(p => {
      if (p.id !== id) return p;
      // Also physically swap width and height so visual container updates
      return { 
        ...p, 
        rotation: p.rotation === 0 ? 90 : 0, 
        width: p.height, 
        height: p.width 
      };
    }));
  };

  // Delete selected panel
  const deletePanel = () => {
    if (!selectedPanel) return;
    setPanels(prev => prev.filter(p => p.id !== selectedPanel));
    setSelectedPanel(null);
  };

  // Change string assignment
  const reassignString = (newStringId) => {
    if (!selectedPanel) return;
    const sc = strings.find(s => s.string_id === newStringId);
    const existingCount = panels.filter(p => p.string_id === newStringId).length;
    setPanels(prev => prev.map(p => {
      if (p.id !== selectedPanel) return p;
      return { ...p, string_id: newStringId, panel_index: existingCount + 1 };
    }));
  };

  // Handle blueprint upload
  const handleBlueprintUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setBackgroundImage(event.target.result);
    };
    reader.readAsDataURL(file);
    if (blueprintInputRef.current) blueprintInputRef.current.value = '';
  };

  const clearBlueprint = () => {
    setBackgroundImage(null);
    setImageOpacity(0.5);
  };

  // Save layout
  const handleSave = async () => {
    setSaving(true);
    const layoutData = {
      site_id: siteId,
      panels,
      canvas_width: 1200,
      canvas_height: 800
    };
    if (existingLayout?.id) {
      await base44.entities.PanelLayout.update(existingLayout.id, layoutData);
    } else {
      await base44.entities.PanelLayout.create(layoutData);
    }
    queryClient.invalidateQueries({ queryKey: ['panelLayout', siteId] });
    setSaving(false);
  };

  // String colors
  const stringColors = {};
  const colorPalette = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#e11d48', '#a855f7', '#22c55e', '#eab308'
  ];
  strings.forEach((s, i) => {
    stringColors[s.string_id] = colorPalette[i % colorPalette.length];
  });

  if (!site) {
    return <div className="flex items-center justify-center min-h-[60vh] text-slate-400">טוען...</div>;
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('SiteDetails') + `?id=${siteId}`}>
            <Button variant="ghost" size="icon" className="rounded-full bg-white border border-slate-200">
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-slate-800">עורך לייאאוט פנלים</h1>
            <p className="text-xs text-slate-500">{site.name} • {totalPanels} פנלים • {strings.length} סטרינגים</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </div>

      <div className="flex gap-4 flex-col lg:flex-row h-[calc(100vh-200px)]">
        {/* Left Toolbar - Panel Palette */}
        <Card className="p-3 border border-slate-200 bg-white w-full lg:w-32 shrink-0 overflow-y-auto">
          <h3 className="font-bold text-sm text-slate-700 mb-3">פנלים</h3>
          <div className="space-y-2">
            {strings.map((s) => {
              const panelCount = panels.filter(p => p.string_id === s.string_id).length;
              return (
                <Button
                  key={s.string_id}
                  variant="outline"
                  size="sm"
                  className="w-full text-xs flex flex-col gap-1 h-auto py-2"
                  style={{ 
                    backgroundColor: stringColors[s.string_id] + '22',
                    borderColor: stringColors[s.string_id]
                  }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('stringId', s.string_id);
                  }}
                  title={`משוך פנל מ-${s.string_id}`}
                >
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: stringColors[s.string_id] }} />
                  <span>{s.string_id}</span>
                  <span className="text-[10px] text-slate-500">{panelCount}/{s.num_panels}</span>
                </Button>
              );
            })}
          </div>
        </Card>

        {/* Canvas - Main Area */}
        <Card className="flex-1 border border-slate-200 bg-white overflow-auto relative flex flex-col">
          {/* Toolbar */}
          <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setImageScale(s => Math.max(0.5, s - 0.2))}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-xs text-slate-500 w-12 text-center">{Math.round(imageScale * 100)}%</span>
              <Button variant="outline" size="sm" onClick={() => setImageScale(s => Math.min(3, s + 0.2))}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
            {backgroundImage && (
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={clearBlueprint}>
                <Trash2 className="w-3 h-3" />
                הסר
              </Button>
            )}
            {!backgroundImage && (
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs gap-1"
                onClick={() => blueprintInputRef.current?.click()}
              >
                <Upload className="w-3 h-3" />
                העלה blueprint
              </Button>
            )}
          </div>

          {/* Canvas area */}
          <div className="flex-1 overflow-auto relative" style={{ background: backgroundImage ? 'transparent' : 'linear-gradient(135deg, #f5f5f5 0%, #e5e5e5 100%)' }}>
            <input type="file" ref={blueprintInputRef} className="hidden" accept="image/*" onChange={handleBlueprintUpload} />
             ref={canvasRef}
             className="relative cursor-crosshair m-auto"
             style={{
               width: backgroundImage ? 1200 * imageScale : 1200 * zoom,
               height: backgroundImage ? 800 * imageScale : 800 * zoom,
               backgroundImage: backgroundImage 
                 ? `url('${backgroundImage}')` 
                 : `radial-gradient(circle, #e2e8f0 1px, transparent 1px)`,
               backgroundSize: 'cover',
               backgroundPosition: 'center',
               backgroundRepeat: 'no-repeat',
               position: 'relative'
             }}
             onClick={() => setSelectedPanel(null)}
             onTouchEnd={() => { setDragging(null); }}
             onDragOver={(e) => {
               if (backgroundImage) {
                 e.preventDefault();
                 e.dataTransfer.dropEffect = 'copy';
               }
             }}
             onDrop={(e) => {
               if (!backgroundImage) return;
               e.preventDefault();
               const stringId = e.dataTransfer.getData('stringId');
               if (!stringId) return;

               const rect = canvasRef.current.getBoundingClientRect();
               const x = snapToGrid((e.clientX - rect.left) / imageScale);
               const y = snapToGrid((e.clientY - rect.top) / imageScale);

               const newPanel = {
                 id: `${stringId}_p${Date.now()}`,
                 x,
                 y,
                 width: PANEL_W,
                 height: PANEL_H,
                 string_id: stringId,
                 panel_index: panels.filter(p => p.string_id === stringId).length + 1,
                 rotation: 0
               };
               setPanels(prev => [...prev, newPanel]);
               setSelectedPanel(newPanel.id);
             }}
             >
             {backgroundImage && (
               <div 
                 style={{
                   position: 'absolute',
                   inset: 0,
                   backgroundColor: 'rgba(255, 255, 255, ' + (1 - imageOpacity) + ')',
                   pointerEvents: 'none'
                 }}
               />
             )}
             <div 
               style={{
                 position: 'absolute',
                 inset: 0,
                 backgroundImage: `radial-gradient(circle, #e2e8f0 1px, transparent 1px)`,
                 backgroundSize: `${GRID_SIZE * (backgroundImage ? imageScale : zoom)}px ${GRID_SIZE * (backgroundImage ? imageScale : zoom)}px`,
                 opacity: backgroundImage ? 0.2 : 1,
                 pointerEvents: 'none'
               }}
             />
             {panels.map(panel => {
              const isSelected = selectedPanel === panel.id;
              const color = stringColors[panel.string_id] || '#94a3b8';
              return (
                <div
                  key={panel.id}
                  className={`absolute flex flex-col items-center justify-center cursor-grab active:cursor-grabbing border-2 rounded-sm transition-shadow select-none ${
                    isSelected ? 'ring-2 ring-offset-1 ring-blue-500 shadow-lg z-10' : 'shadow-sm'
                  }`}
                  style={{
                    left: panel.x * zoom,
                    top: panel.y * zoom,
                    width: panel.width * zoom,
                    height: panel.height * zoom,
                    backgroundColor: color + '33',
                    borderColor: color,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, panel.id)}
                  onTouchStart={(e) => handleTouchStart(e, panel.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    rotatePanelId(panel.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPanel(panel.id);
                  }}
                >
                  <span className="text-[8px] font-bold leading-none" style={{ color, fontSize: Math.max(7, 9 * zoom) }}>
                    {panel.string_id}
                  </span>
                  <span className="text-[7px] text-slate-500 leading-none" style={{ fontSize: Math.max(6, 7 * zoom) }}>
                    #{panel.panel_index}
                  </span>
                </div>
              );
            })}
            </div>
        </Card>
      </div>
    </div>
  );
}