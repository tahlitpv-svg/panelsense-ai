import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Layers, RotateCw, Save, Trash2, Upload, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import EditorSolarPanel from '@/components/site/editor/EditorSolarPanel';
import StringPortMapPanel from '@/components/site/editor/StringPortMapPanel';

const PANEL_W = 40;
const PANEL_H = 60;
const GRID_SIZE = 10;
const CANVAS_W = 1600;
const CANVAS_H = 1000;
const COLORS = ['#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

const snapToGrid = (value) => Math.round(value / GRID_SIZE) * GRID_SIZE;

export default function PanelLayoutEditor() {
  const urlParams = new URLSearchParams(window.location.search);
  const siteId = urlParams.get('siteId');
  const queryClient = useQueryClient();
  const canvasRef = useRef(null);
  const fileRef = useRef(null);

  const { data: site } = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => base44.entities.Site.filter({ id: siteId }).then((items) => items[0]),
    enabled: !!siteId,
  });

  const { data: existingLayout } = useQuery({
    queryKey: ['panelLayout', siteId],
    queryFn: () => base44.entities.PanelLayout.filter({ site_id: siteId }).then((items) => items[0] || null),
    enabled: !!siteId,
  });

  const [panels, setPanels] = useState([]);
  const [stringConfigs, setStringConfigs] = useState([]);
  const [selectedPanels, setSelectedPanels] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [scale, setScale] = useState(0.9);
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [imageOpacity, setImageOpacity] = useState(0.6);
  const [saving, setSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (existingLayout?.panels) setPanels(existingLayout.panels);
  }, [existingLayout]);

  useEffect(() => {
    if (site?.string_configs) setStringConfigs(site.string_configs);
  }, [site]);

  const stringColors = useMemo(() => Object.fromEntries((stringConfigs || []).map((s, i) => [s.string_id, COLORS[i % COLORS.length]])), [stringConfigs]);
  const panelCounts = useMemo(() => panels.reduce((acc, panel) => ({ ...acc, [panel.string_id]: (acc[panel.string_id] || 0) + 1 }), {}), [panels]);

  const onMouseDown = (e, panelId) => {
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    let nextSelected = selectedPanels;
    if (e.shiftKey) {
      nextSelected = selectedPanels.includes(panelId)
        ? selectedPanels.filter((id) => id !== panelId)
        : [...selectedPanels, panelId];
    } else if (!selectedPanels.includes(panelId)) {
      nextSelected = [panelId];
    }
    setSelectedPanels(nextSelected);

    const offsets = nextSelected.map((id) => {
      const panel = panels.find((item) => item.id === id);
      return {
        id,
        offsetX: (e.clientX - rect.left) / scale - panel.x,
        offsetY: (e.clientY - rect.top) / scale - panel.y,
      };
    });
    setDragging({ offsets });
  };

  const onMouseMove = useCallback((e) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setPanels((prev) => prev.map((panel) => {
      const hit = dragging.offsets.find((item) => item.id === panel.id);
      if (!hit) return panel;
      return {
        ...panel,
        x: Math.max(0, Math.min(CANVAS_W - panel.width, snapToGrid((e.clientX - rect.left) / scale - hit.offsetX))),
        y: Math.max(0, Math.min(CANVAS_H - panel.height, snapToGrid((e.clientY - rect.top) / scale - hit.offsetY))),
      };
    }));
  }, [dragging, scale]);

  useEffect(() => {
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onMouseMove]);

  const rotateSelected = () => {
    if (!selectedPanels.length) return;
    setPanels((prev) => prev.map((panel) => selectedPanels.includes(panel.id)
      ? { ...panel, width: panel.height, height: panel.width, rotation: panel.rotation === 90 ? 0 : 90 }
      : panel));
  };

  const deleteSelected = () => {
    if (!selectedPanels.length) return;
    setPanels((prev) => prev.filter((panel) => !selectedPanels.includes(panel.id)));
    setSelectedPanels([]);
  };

  const updateStringPort = (stringId, inverterPort) => {
    setStringConfigs((prev) => prev.map((item) => item.string_id === stringId ? { ...item, inverter_port: inverterPort } : item));
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackgroundFile(file);
    const reader = new FileReader();
    reader.onload = (event) => setBackgroundImage(event.target.result);
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const analyzeBlueprint = async () => {
    if (!backgroundFile) return;
    setIsAnalyzing(true);
    try {
      const upload = await base44.integrations.Core.UploadFile({ file: backgroundFile });
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are analyzing a solar system simulation / rooftop layout image.
Identify every solar panel by its rectangular frame.
Use the frame/border of each panel as the primary signal.
Panels usually have:
- dark blue/black interior
- silver/white/aluminum rectangular frame
- grid/cell texture inside
- portrait or landscape orientation
Return only JSON with this shape:
{
  "panels": [{
    "x_percent": 0,
    "y_percent": 0,
    "width_percent": 0,
    "height_percent": 0,
    "is_landscape": false,
    "string_id": "S1"
  }]
}
Rules:
- detect ALL framed panels
- x/y are panel center percent
- width/height are panel size percent
- string_id is best guess from grouping or nearby labels
- no explanations, JSON only`,
        file_urls: [upload.file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            panels: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  x_percent: { type: 'number' },
                  y_percent: { type: 'number' },
                  width_percent: { type: 'number' },
                  height_percent: { type: 'number' },
                  is_landscape: { type: 'boolean' },
                  string_id: { type: 'string' },
                },
                required: ['x_percent', 'y_percent', 'is_landscape'],
              },
            },
          },
          required: ['panels'],
        },
      });

      if (result?.panels?.length) {
        const nextPanels = result.panels.map((item, idx) => {
          const width = Math.max(PANEL_W, Math.min(Math.round(((item.width_percent || 2.5) / 100) * CANVAS_W), PANEL_W * 3));
          const height = Math.max(PANEL_H, Math.min(Math.round(((item.height_percent || 4) / 100) * CANVAS_H), PANEL_H * 3));
          const matchedString = (stringConfigs || []).find((entry) => entry.string_id === item.string_id)
            || (stringConfigs || []).find((entry) => entry.string_id.replace(/\D/g, '') === (item.string_id || '').replace(/\D/g, ''))
            || stringConfigs[0];
          const x = snapToGrid(((item.x_percent || 0) / 100) * CANVAS_W - width / 2);
          const y = snapToGrid(((item.y_percent || 0) / 100) * CANVAS_H - height / 2);
          return {
            id: `ai_${Date.now()}_${idx}`,
            x: Math.max(0, Math.min(CANVAS_W - width, x)),
            y: Math.max(0, Math.min(CANVAS_H - height, y)),
            width,
            height,
            rotation: item.is_landscape ? 90 : 0,
            string_id: matchedString?.string_id || 'S1',
            panel_index: idx + 1,
          };
        });
        setPanels((prev) => [...prev, ...nextPanels]);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const payload = { site_id: siteId, panels, canvas_width: CANVAS_W, canvas_height: CANVAS_H };
      if (existingLayout?.id) {
        await base44.entities.PanelLayout.update(existingLayout.id, payload);
      } else {
        await base44.entities.PanelLayout.create(payload);
      }
      await base44.entities.Site.update(siteId, { string_configs: stringConfigs });
      queryClient.invalidateQueries({ queryKey: ['panelLayout', siteId] });
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    } finally {
      setSaving(false);
    }
  };

  if (!site) return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">טוען...</div>;

  const selectedPanel = selectedPanels.length === 1 ? panels.find((panel) => panel.id === selectedPanels[0]) : null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 text-white flex flex-col" dir="rtl">
      <div className="h-14 shrink-0 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={createPageUrl('SiteDetails') + `?id=${siteId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-800">
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-bold text-sm text-white truncate">{site.name}</span>
            <Badge className="bg-slate-800 text-slate-300 border-slate-700">{panels.length} פנלים</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-white" onClick={() => setScale((prev) => Math.max(0.4, +(prev - 0.1).toFixed(1)))}>
              <ZoomOut className="w-3 h-3" />
            </Button>
            <span className="text-xs text-slate-300 w-10 text-center">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-white" onClick={() => setScale((prev) => Math.min(2.2, +(prev + 0.1).toFixed(1)))}>
              <ZoomIn className="w-3 h-3" />
            </Button>
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-800 gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" /> העלה הדמיה
          </Button>
          {backgroundImage && (
            <>
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700 gap-1.5" disabled={isAnalyzing} onClick={analyzeBlueprint}>
                <Wand2 className="w-3.5 h-3.5" /> {isAnalyzing ? 'מזהה...' : 'זהה פנלים'}
              </Button>
              <input type="range" min="0.2" max="1" step="0.05" value={imageOpacity} onChange={(e) => setImageOpacity(Number(e.target.value))} className="w-20 accent-cyan-400" />
            </>
          )}
          <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5" onClick={saveAll} disabled={saving}>
            <Save className="w-3.5 h-3.5" /> {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-[78px] shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col items-center py-3 gap-2 overflow-y-auto">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">סטרינגים</span>
          {stringConfigs.map((item) => (
            <button
              key={item.string_id}
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('stringId', item.string_id); }}
              className="w-12 h-16 rounded-md flex flex-col items-center justify-center gap-1 text-white cursor-grab active:cursor-grabbing"
              style={{ background: 'linear-gradient(155deg, #1b3f6e 0%, #071428 100%)', border: `2px solid ${stringColors[item.string_id]}`, boxShadow: `0 0 8px ${stringColors[item.string_id]}44` }}
            >
              <span className="text-[8px] font-bold" style={{ color: stringColors[item.string_id] }}>{item.string_id}</span>
              <span className="text-[7px] text-slate-500">{panelCounts[item.string_id] || 0}/{item.num_panels || 0}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto" style={{ background: 'radial-gradient(ellipse at center, #0f1e36 0%, #070e1a 100%)' }}>
          <div
            ref={canvasRef}
            className="relative"
            style={{
              width: CANVAS_W * scale,
              height: CANVAS_H * scale,
              backgroundImage: backgroundImage
                ? `url('${backgroundImage}')`
                : 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
              backgroundSize: backgroundImage ? 'contain' : `${20 * scale}px ${20 * scale}px`,
              backgroundRepeat: backgroundImage ? 'no-repeat' : 'repeat',
              backgroundPosition: 'center',
              minWidth: '100%',
              minHeight: '100%',
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
              const panel = {
                id: `${stringId}_${Date.now()}`,
                x: Math.max(0, Math.min(CANVAS_W - PANEL_W, x)),
                y: Math.max(0, Math.min(CANVAS_H - PANEL_H, y)),
                width: PANEL_W,
                height: PANEL_H,
                rotation: 0,
                string_id: stringId,
                panel_index: (panelCounts[stringId] || 0) + 1,
              };
              setPanels((prev) => [...prev, panel]);
              setSelectedPanels([panel.id]);
            }}
          >
            {backgroundImage && <div style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(7,14,26,${1 - imageOpacity})`, pointerEvents: 'none' }} />}

            {panels.map((panel) => (
              <div
                key={panel.id}
                className="absolute"
                style={{ left: panel.x * scale, top: panel.y * scale, width: panel.width * scale, height: panel.height * scale, zIndex: selectedPanels.includes(panel.id) ? 20 : 10 }}
                onMouseDown={(e) => onMouseDown(e, panel.id)}
                onDoubleClick={(e) => { e.stopPropagation(); setPanels((prev) => prev.map((item) => item.id === panel.id ? { ...item, width: item.height, height: item.width, rotation: item.rotation === 90 ? 0 : 90 } : item)); }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) {
                    setSelectedPanels((prev) => prev.includes(panel.id) ? prev.filter((id) => id !== panel.id) : [...prev, panel.id]);
                  } else {
                    setSelectedPanels([panel.id]);
                  }
                }}
              >
                <EditorSolarPanel
                  width={panel.width}
                  height={panel.height}
                  color={stringColors[panel.string_id] || '#94a3b8'}
                  isSelected={selectedPanels.includes(panel.id)}
                  stringId={panel.string_id}
                  panelIndex={panel.panel_index}
                  scale={scale}
                  watts={0}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="w-72 shrink-0 border-r border-slate-800 bg-slate-900 overflow-y-auto p-3 space-y-4">
          {selectedPanels.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
              <div>
                <h3 className="font-bold text-sm text-white">{selectedPanels.length > 1 ? `${selectedPanels.length} פנלים נבחרו` : 'פנל נבחר'}</h3>
                {selectedPanel && <p className="text-xs text-slate-400 mt-1">{selectedPanel.string_id} · #{selectedPanel.panel_index} · {selectedPanel.width}×{selectedPanel.height}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700" onClick={rotateSelected}>
                  <RotateCw className="w-3.5 h-3.5" />
                </Button>
                <Button className="flex-1 bg-red-900 text-red-200 hover:bg-red-800" onClick={deleteSelected}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          <StringPortMapPanel
            strings={stringConfigs}
            stringColors={stringColors}
            panelCounts={panelCounts}
            onChangePort={updateStringPort}
          />
        </div>
      </div>
    </div>
  );
}