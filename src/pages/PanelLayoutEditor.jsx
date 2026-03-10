import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Layers, Move, RotateCw, Save, Trash2, Upload, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import EditorSolarPanel from '@/components/site/editor/EditorSolarPanel';
import StringPortMapPanel from '@/components/site/editor/StringPortMapPanel';

const PANEL_W = 40;
const PANEL_H = 60;
const GRID_SIZE = 10;
const CANVAS_W = 1600;
const CANVAS_H = 1400;
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
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(null);
  const [backgroundFile, setBackgroundFile] = useState(null);
  const [backgroundDimensions, setBackgroundDimensions] = useState({ width: CANVAS_W, height: CANVAS_H });
  const [backgroundScale, setBackgroundScale] = useState(1);
  const [imageOpacity, setImageOpacity] = useState(0.85);
  const [saving, setSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeStringId, setActiveStringId] = useState(null);
  const [templateSize, setTemplateSize] = useState({ width: PANEL_W, height: PANEL_H });
  const [measureMode, setMeasureMode] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [measureDraft, setMeasureDraft] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [isBrushing, setIsBrushing] = useState(false);
  const [brushStartPoint, setBrushStartPoint] = useState(null);
  const [brushAxis, setBrushAxis] = useState(null);

  useEffect(() => {
    if (existingLayout?.panels) setPanels(existingLayout.panels);
    if (existingLayout?.background_image_url) {
      setBackgroundImage(existingLayout.background_image_url);
      setBackgroundImageUrl(existingLayout.background_image_url);
    }
    if (existingLayout?.background_opacity != null) {
      setImageOpacity(existingLayout.background_opacity);
    }
    if (existingLayout?.background_scale != null) {
      setBackgroundScale(existingLayout.background_scale);
    }
  }, [existingLayout]);

  useEffect(() => {
    if (site?.string_configs) setStringConfigs(site.string_configs);
  }, [site]);

  useEffect(() => {
    if (!activeStringId && site?.string_configs?.length) {
      setActiveStringId(site.string_configs[0].string_id);
    }
  }, [site, activeStringId]);

  useEffect(() => {
    if (!backgroundImage) {
      setBackgroundDimensions({ width: CANVAS_W, height: CANVAS_H });
      return;
    }

    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || CANVAS_W;
      const height = img.naturalHeight || CANVAS_H;
      setBackgroundDimensions({ width, height });
    };
    img.src = backgroundImage;
  }, [backgroundImage]);

  const canvasWidth = backgroundImage ? backgroundDimensions.width : CANVAS_W;
  const canvasHeight = backgroundImage ? backgroundDimensions.height : CANVAS_H;
  const stageScale = scale * backgroundScale;

  const stringColors = useMemo(() => Object.fromEntries((stringConfigs || []).map((s, i) => [s.string_id, COLORS[i % COLORS.length]])), [stringConfigs]);
  const panelCounts = useMemo(() => panels.reduce((acc, panel) => ({ ...acc, [panel.string_id]: (acc[panel.string_id] || 0) + 1 }), {}), [panels]);

  const getCanvasPoint = useCallback((event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / stageScale,
      y: (event.clientY - rect.top) / stageScale,
    };
  }, [stageScale]);

  const getPlacementRect = useCallback((x, y) => {
    const width = templateSize.width;
    const height = templateSize.height;
    return {
      x: Math.max(0, Math.min(canvasWidth - width, x - width / 2)),
      y: Math.max(0, Math.min(canvasHeight - height, y - height / 2)),
      width,
      height,
    };
  }, [templateSize, canvasWidth, canvasHeight]);

  const addPanelAtPoint = useCallback((x, y, stringId = activeStringId) => {
    if (!stringId) return;
    setPanels((prev) => {
      const rect = getPlacementRect(x, y);
      const exists = prev.some((panel) => (
        panel.x < rect.x + rect.width &&
        panel.x + panel.width > rect.x &&
        panel.y < rect.y + rect.height &&
        panel.y + panel.height > rect.y
      ));
      if (exists) return prev;
      return [
        ...prev,
        {
          id: `${stringId}_${Date.now()}_${prev.length}`,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          rotation: rect.width > rect.height ? 90 : 0,
          string_id: stringId,
          panel_index: prev.filter((panel) => panel.string_id === stringId).length + 1,
        },
      ];
    });
  }, [activeStringId, getPlacementRect]);

  const removePanelAtPoint = useCallback((x, y) => {
    setPanels((prev) => prev.filter((panel) => !(x >= panel.x && x <= panel.x + panel.width && y >= panel.y && y <= panel.y + panel.height)));
  }, []);

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
        offsetX: (e.clientX - rect.left) / stageScale - panel.x,
        offsetY: (e.clientY - rect.top) / stageScale - panel.y,
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
        x: Math.max(0, Math.min(canvasWidth - panel.width, (e.clientX - rect.left) / stageScale - hit.offsetX)),
        y: Math.max(0, Math.min(canvasHeight - panel.height, (e.clientY - rect.top) / stageScale - hit.offsetY)),
      };
    }));
  }, [dragging, stageScale, canvasWidth, canvasHeight]);

  useEffect(() => {
    const onUp = () => {
      setDragging(null);
      setIsBrushing(false);
      setBrushStartPoint(null);
      setBrushAxis(null);
      if (measureDraft) {
        const width = Math.abs(measureDraft.endX - measureDraft.startX);
        const height = Math.abs(measureDraft.endY - measureDraft.startY);
        if (width >= 20 && height >= 20) {
          setTemplateSize({ width: Math.round(width), height: Math.round(height) });
          setPlacementMode(true);
          setDeleteMode(false);
          setMeasureMode(false);
        }
        setMeasureDraft(null);
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onMouseMove, measureDraft]);

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
    setBackgroundImageUrl(null);
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
        prompt: `You are analyzing a solar system layout simulation image.
Your goal is to detect solar panels by looking for REPEATED RECTANGLES WITH THE SAME FRAME SIZE.
Focus on the panel FRAME / OUTLINE first.

What to look for:
- repeated identical rectangles
- thin silver / white / gray panel frame
- dark panel interior with cell grid texture
- ignore green wiring lines, labels, roof texture, walls and shadows
- many panels in the same group usually have almost identical width and height

Important:
- search for matching rectangles that repeat across the image
- if a group has equal-size framed rectangles, count all of them
- prefer frame geometry over colors
- if a panel is partly covered by wiring, still detect it by its frame

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
- detect ALL framed repeated rectangles that are solar panels
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
      let nextBackgroundImageUrl = backgroundImageUrl || existingLayout?.background_image_url || null;
      if (backgroundFile) {
        const upload = await base44.integrations.Core.UploadFile({ file: backgroundFile });
        nextBackgroundImageUrl = upload.file_url;
        setBackgroundImageUrl(nextBackgroundImageUrl);
        setBackgroundFile(null);
      }

      const payload = {
        site_id: siteId,
        panels,
        canvas_width: canvasWidth,
        canvas_height: canvasHeight,
        background_image_url: nextBackgroundImageUrl,
        background_opacity: imageOpacity,
        background_scale: backgroundScale,
      };
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

  if (!site) return <div className="min-h-screen bg-slate-100 text-slate-500 flex items-center justify-center">טוען...</div>;

  const moveMode = !measureMode && !placementMode && !deleteMode;
  const selectedPanel = selectedPanels.length === 1 ? panels.find((panel) => panel.id === selectedPanels[0]) : null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-100 text-slate-900 flex flex-col" dir="rtl">
      <div className="h-14 shrink-0 border-b border-slate-200 bg-white flex items-center justify-between px-4 gap-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={createPageUrl('SiteDetails') + `?id=${siteId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-100">
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-cyan-600 shrink-0" />
            <span className="font-bold text-sm text-slate-900 truncate">{site.name}</span>
            <Badge className="bg-slate-100 text-slate-700 border-slate-200">{panels.length} פנלים</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <div className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 border border-slate-200">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-900" onClick={() => setScale((prev) => Math.max(0.4, +(prev - 0.1).toFixed(1)))}>
              <ZoomOut className="w-3 h-3" />
            </Button>
            <span className="text-xs text-slate-700 w-10 text-center">{Math.round(scale * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-slate-900" onClick={() => setScale((prev) => Math.min(2.2, +(prev + 0.1).toFixed(1)))}>
              <ZoomIn className="w-3 h-3" />
            </Button>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
            <span>גודל דגימה:</span>
            <span className="font-bold text-slate-900">{templateSize.width}×{templateSize.height}</span>
          </div>

          {backgroundImage && (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              <span>סקייל הדמיה</span>
              <input type="range" min="0.6" max="2.5" step="0.05" value={backgroundScale} onChange={(e) => setBackgroundScale(Number(e.target.value))} className="w-24 accent-cyan-500" />
              <span className="font-bold text-slate-900 w-10 text-center">{Math.round(backgroundScale * 100)}%</span>
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" /> העלה הדמיה
          </Button>
          <Button
            size="sm"
            variant={moveMode ? 'default' : 'outline'}
            className={moveMode ? 'bg-slate-900 hover:bg-slate-800 gap-1.5' : 'gap-1.5'}
            onClick={() => {
              setMeasureMode(false);
              setPlacementMode(false);
              setDeleteMode(false);
              setMeasureDraft(null);
            }}
          >
            <Move className="w-3.5 h-3.5" /> הזזה
          </Button>
          <Button
            size="sm"
            variant={measureMode ? 'default' : 'outline'}
            className={measureMode ? 'bg-blue-600 hover:bg-blue-700 gap-1.5' : 'gap-1.5'}
            onClick={() => {
              setMeasureMode((prev) => !prev);
              setPlacementMode(false);
              setDeleteMode(false);
              setMeasureDraft(null);
            }}
          >
            דגום מסגרת
          </Button>
          <Button
            size="sm"
            variant={placementMode ? 'default' : 'outline'}
            className={placementMode ? 'bg-amber-500 hover:bg-amber-600 text-black gap-1.5' : 'gap-1.5'}
            onClick={() => {
              setPlacementMode((prev) => !prev);
              setMeasureMode(false);
              setDeleteMode(false);
            }}
          >
            מברשת פנלים
          </Button>
          <Button
            size="sm"
            variant={deleteMode ? 'default' : 'outline'}
            className={deleteMode ? 'bg-red-600 hover:bg-red-700 gap-1.5' : 'gap-1.5'}
            onClick={() => {
              setDeleteMode((prev) => !prev);
              setPlacementMode(false);
              setMeasureMode(false);
            }}
          >
            סימון למחיקה
          </Button>
          {backgroundImage && (
            <input type="range" min="0.35" max="1" step="0.05" value={imageOpacity} onChange={(e) => setImageOpacity(Number(e.target.value))} className="w-20 accent-cyan-500" />
          )}
          <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setPanels([]); setSelectedPanels([]); }}>
            <Trash2 className="w-3.5 h-3.5" /> מחק הכל
          </Button>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5" onClick={saveAll} disabled={saving}>
            <Save className="w-3.5 h-3.5" /> {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-[90px] shrink-0 border-l border-slate-200 bg-white flex flex-col items-center py-3 gap-2 overflow-y-auto">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">סטרינגים</span>
          {stringConfigs.map((item) => (
            <button
              key={item.string_id}
              draggable
              onClick={() => setActiveStringId(item.string_id)}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('stringId', item.string_id); }}
              className="w-14 h-16 rounded-md flex flex-col items-center justify-center gap-1 cursor-grab active:cursor-grabbing transition-all"
              style={{
                background: activeStringId === item.string_id ? `${stringColors[item.string_id]}22` : '#ffffff',
                border: `2px solid ${stringColors[item.string_id]}`,
                boxShadow: activeStringId === item.string_id ? `0 0 0 2px ${stringColors[item.string_id]}33` : 'none'
              }}
            >
              <span className="text-[9px] font-bold" style={{ color: stringColors[item.string_id] }}>{item.string_id}</span>
              <span className="text-[7px] text-slate-500">{panelCounts[item.string_id] || 0}/{item.num_panels || 0}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto bg-slate-200">
          <div className="min-w-full min-h-full flex justify-center items-start p-6">
          <div
            ref={canvasRef}
            className="relative shrink-0"
            style={{
              width: canvasWidth * stageScale,
              height: canvasHeight * stageScale,
              backgroundColor: '#ffffff',
              backgroundImage: backgroundImage
                ? 'none'
                : 'linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)',
              backgroundSize: `${20 * stageScale}px ${20 * stageScale}px`,
              backgroundRepeat: 'repeat',
              backgroundPosition: 'top left',
            }}
            onClick={() => setSelectedPanels([])}
            onMouseMove={(e) => {
              if (isBrushing && e.buttons !== 1) {
                setIsBrushing(false);
                setBrushStartPoint(null);
                setBrushAxis(null);
                return;
              }

              const point = getCanvasPoint(e);
              let nextPoint = point;

              if (isBrushing && placementMode && brushStartPoint) {
                const dx = point.x - brushStartPoint.x;
                const dy = point.y - brushStartPoint.y;
                let nextAxis = brushAxis;

                if (!nextAxis && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
                  nextAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
                  setBrushAxis(nextAxis);
                }

                if (nextAxis === 'x') {
                  const stepCount = Math.round(dx / templateSize.width);
                  nextPoint = {
                    x: brushStartPoint.x + stepCount * templateSize.width,
                    y: brushStartPoint.y,
                  };
                } else if (nextAxis === 'y') {
                  const stepCount = Math.round(dy / templateSize.height);
                  nextPoint = {
                    x: brushStartPoint.x,
                    y: brushStartPoint.y + stepCount * templateSize.height,
                  };
                }
              }

              setHoverPoint(nextPoint);
              if (measureDraft) {
                setMeasureDraft((prev) => prev ? { ...prev, endX: point.x, endY: point.y } : prev);
              } else if (isBrushing && placementMode) {
                addPanelAtPoint(nextPoint.x, nextPoint.y);
              } else if (isBrushing && deleteMode) {
                removePanelAtPoint(point.x, point.y);
              }
            }}
            onMouseLeave={() => {
              setHoverPoint(null);
              setIsBrushing(false);
            }}
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget) return;
              const point = getCanvasPoint(e);
              if (measureMode) {
                setMeasureDraft({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
                return;
              }
              if (placementMode) {
                setIsBrushing(true);
                setBrushStartPoint(point);
                setBrushAxis(null);
                addPanelAtPoint(point.x, point.y);
                return;
              }
              if (deleteMode) {
                setIsBrushing(true);
                removePanelAtPoint(point.x, point.y);
              }
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={(e) => {
              e.preventDefault();
              const stringId = e.dataTransfer.getData('stringId');
              if (!stringId) return;
              const point = getCanvasPoint(e);
              setActiveStringId(stringId);
              addPanelAtPoint(point.x, point.y, stringId);
            }}
          >
            {backgroundImage && (
              <>
                <img
                  src={backgroundImage}
                  alt="Simulation"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none'
                  }}
                />
                <div style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(255,255,255,${1 - imageOpacity})`, pointerEvents: 'none' }} />
              </>
            )}
            {measureDraft && (
              <div
                style={{
                  position: 'absolute',
                  left: Math.min(measureDraft.startX, measureDraft.endX) * stageScale,
                  top: Math.min(measureDraft.startY, measureDraft.endY) * stageScale,
                  width: Math.abs(measureDraft.endX - measureDraft.startX) * stageScale,
                  height: Math.abs(measureDraft.endY - measureDraft.startY) * stageScale,
                  border: '2px dashed #2563eb',
                  backgroundColor: 'rgba(37,99,235,0.08)',
                  pointerEvents: 'none',
                  zIndex: 30,
                }}
              />
            )}
            {placementMode && hoverPoint && activeStringId && (() => {
              const previewRect = getPlacementRect(hoverPoint.x, hoverPoint.y);
              return (
                <div
                  style={{
                    position: 'absolute',
                    left: previewRect.x * stageScale,
                    top: previewRect.y * stageScale,
                    width: previewRect.width * stageScale,
                    height: previewRect.height * stageScale,
                    border: `2px dashed ${stringColors[activeStringId] || '#0ea5e9'}`,
                    backgroundColor: `${stringColors[activeStringId] || '#0ea5e9'}22`,
                    pointerEvents: 'none',
                    zIndex: 25,
                  }}
                />
              );
            })()}

            {panels.map((panel) => (
              <div
                key={panel.id}
                className="absolute"
                style={{ left: panel.x * stageScale, top: panel.y * stageScale, width: panel.width * stageScale, height: panel.height * stageScale, zIndex: selectedPanels.includes(panel.id) ? 20 : 10 }}
                onMouseDown={(e) => {
                  if (deleteMode) {
                    e.stopPropagation();
                    setPanels((prev) => prev.filter((item) => item.id !== panel.id));
                    return;
                  }
                  if (!moveMode) return;
                  onMouseDown(e, panel.id);
                }}
                onDoubleClick={(e) => { e.stopPropagation(); setPanels((prev) => prev.map((item) => item.id === panel.id ? { ...item, width: item.height, height: item.width, rotation: item.rotation === 90 ? 0 : 90 } : item)); }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!moveMode) return;
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
                  scale={stageScale}
                  watts={0}
                />
              </div>
            ))}
          </div>
          </div>
        </div>

        <div className="w-72 shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-3 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs text-slate-600">
            <div className="font-bold text-slate-900">איך לעבוד מהר</div>
            <div>1. העלה הדמיה</div>
            <div>2. לחץ "דגום מסגרת" וגרור על פנל אחד</div>
            <div>3. לחץ "מברשת פנלים" ועבור עם העכבר על המסגרות</div>
            <div>4. לחץ "סימון למחיקה" כדי למחוק פנלים בגרירה</div>
            <div>5. בחר סטרינג בצד ושמור</div>
          </div>

          {selectedPanels.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">{selectedPanels.length > 1 ? `${selectedPanels.length} פנלים נבחרו` : 'פנל נבחר'}</h3>
                {selectedPanel && <p className="text-xs text-slate-500 mt-1">{selectedPanel.string_id} · #{selectedPanel.panel_index} · {selectedPanel.width}×{selectedPanel.height}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-slate-200 bg-white text-slate-700 hover:bg-slate-100 gap-1.5" onClick={() => {
                  setMeasureMode(false);
                  setPlacementMode(false);
                  setDeleteMode(false);
                }}>
                  <Move className="w-3.5 h-3.5" /> הזזה
                </Button>
                <Button variant="outline" className="flex-1 border-slate-200 bg-white text-slate-700 hover:bg-slate-100" onClick={rotateSelected}>
                  <RotateCw className="w-3.5 h-3.5" />
                </Button>
                <Button className="bg-red-600 text-white hover:bg-red-700" onClick={deleteSelected}>
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
            activeStringId={activeStringId}
            onSelectString={setActiveStringId}
          />
        </div>
      </div>
    </div>
  );
}