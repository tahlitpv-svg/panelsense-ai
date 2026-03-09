import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, X, Check, Mail, Phone, MessageSquare, FlaskConical, Bell, ShieldAlert, ImagePlus, XCircle, Clock } from 'lucide-react';
import DetectionRulesEditor from '../components/faults/DetectionRulesEditor';
import ActiveAlertsList from '../components/faults/ActiveAlertsList';

function Toggle({ checked, onChange, label, icon: Icon }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all select-none ${
        checked
          ? 'bg-green-50 border-green-300 text-green-700'
          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
      }`}
    >
      <div className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${checked ? 'bg-green-500' : 'bg-slate-200'}`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${checked ? 'right-0.5' : 'left-0.5'}`} />
      </div>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span>{label}</span>
    </button>
  );
}

const SEVERITY_COLORS = {
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700'
};

const SEVERITY_LABELS = { info: 'מידע', warning: 'אזהרה', critical: 'קריטי' };

const ALERT_TYPE_LABELS = {
  low_production: 'ייצור נמוך',
  offline: 'לא מקוון',
  cleaning_recommended: 'ניקוי נדרש',
  inverter_fault: 'תקלת ממיר',
  string_mismatch: 'חוסר התאמת סטרינג',
  phase_voltage_out_of_range: 'מתח פאזה חריג',
  communication_fault: 'תקלת תקשורת',
  mid_day_power_drop: 'נפילת מתח באמצע היום',
  other: 'אחר'
};

const EMPTY_FORM = {
  name: '',
  description: '',
  solution: '',
  detection_notes: '',
  reference_images: [],
  check_hour_from: 6,
  check_hour_to: 20,
  severity: 'warning',
  alert_type: 'other',
  notify_email: true,
  notify_whatsapp: false,
  notify_phone: false,
  email_template: '',
  whatsapp_template: '',
  is_active: true,
  detection_rules: [],
  detection_logic: 'all',
  consecutive_checks_required: 2,
  check_only_during_daylight: true
};

export default function Faults() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: faultTypes = [], isLoading } = useQuery({
    queryKey: ['faultTypes'],
    queryFn: () => base44.entities.FaultType.list('-created_date')
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FaultType.create(data),
    onSuccess: () => { queryClient.invalidateQueries(['faultTypes']); closeForm(); }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FaultType.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(['faultTypes']); closeForm(); }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.FaultType.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['faultTypes'])
  });

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (ft) => { setEditing(ft); setForm({ ...ft }); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); };

  const handleSave = () => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const [uploading, setUploading] = useState(false);
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const urls = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setForm(f => ({ ...f, reference_images: [...(f.reference_images || []), ...urls] }));
    setUploading(false);
    e.target.value = '';
  };

  const removeImage = (idx) => {
    setForm(f => ({ ...f, reference_images: (f.reference_images || []).filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">תקלות והתראות</h1>
          <p className="text-sm text-slate-500 mt-1">ניטור פעיל, הגדרת סוגי תקלות וניהול התראות</p>
        </div>
        <Button onClick={openNew} className="bg-green-600 hover:bg-green-700 text-white gap-2">
          <Plus className="w-4 h-4" />
          הוסף תקלה
        </Button>
      </div>

      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList className="bg-white border border-slate-200 p-1 h-10 rounded-xl">
          <TabsTrigger value="alerts" className="data-[state=active]:bg-red-50 data-[state=active]:text-red-700 gap-1.5 rounded-lg text-sm">
            <Bell className="w-3.5 h-3.5" />
            התראות פעילות
          </TabsTrigger>
          <TabsTrigger value="types" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-700 gap-1.5 rounded-lg text-sm">
            <ShieldAlert className="w-3.5 h-3.5" />
            סוגי תקלות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alerts">
          <ActiveAlertsList />
        </TabsContent>

        <TabsContent value="types">
          <div className="space-y-4">

          {/* Form */}
      {showForm && (
        <Card className="p-6 border border-green-200 bg-green-50/30 shadow-sm space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-slate-800">{editing ? 'עריכת סוג תקלה' : 'הוספת סוג תקלה חדש'}</h2>
            <Button variant="ghost" size="icon" onClick={closeForm}><X className="w-4 h-4" /></Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>שם התקלה *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="לדוג': ממיר לא מגיב" />
            </div>
            <div className="space-y-1">
              <Label>סוג התראה</Label>
              <Select value={form.alert_type} onValueChange={v => set('alert_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ALERT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>חומרה</Label>
              <Select value={form.severity} onValueChange={v => set('severity', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">מידע</SelectItem>
                  <SelectItem value="warning">אזהרה</SelectItem>
                  <SelectItem value="critical">קריטי</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex items-center gap-2 pt-6">
              <Toggle checked={form.is_active} onChange={v => set('is_active', v)} label="פעיל" />
            </div>
          </div>

          {/* Check hours */}
          <div className="flex items-center gap-3 flex-wrap">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">שעות בדיקה:</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={23}
                value={form.check_hour_from ?? 6}
                onChange={e => set('check_hour_from', Math.min(23, Math.max(0, Number(e.target.value))))}
                className="w-20 h-8 text-sm text-center"
              />
              <span className="text-slate-400">עד</span>
              <Input
                type="number"
                min={1}
                max={24}
                value={form.check_hour_to ?? 20}
                onChange={e => set('check_hour_to', Math.min(24, Math.max(1, Number(e.target.value))))}
                className="w-20 h-8 text-sm text-center"
              />
            </div>
            <span className="text-xs text-slate-400">(בדיקה תרוץ רק בטווח שעות זה)</span>
          </div>

          <div className="space-y-1">
            <Label>תיאור התקלה</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="תאר את התקלה..." rows={2} />
          </div>

          <div className="space-y-1">
            <Label>פתרון מוצע</Label>
            <Textarea value={form.solution} onChange={e => set('solution', e.target.value)} placeholder="מה לעשות כשהתקלה מופיעה..." rows={2} />
          </div>

          {/* Free-text detection notes */}
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5">
              <span>הערות זיהוי לאלגוריתם</span>
              <span className="text-xs font-normal text-slate-400">(תיאור חופשי)</span>
            </Label>
            <Textarea
              value={form.detection_notes}
              onChange={e => set('detection_notes', e.target.value)}
              placeholder={`תאר בשפה חופשית כיצד לזהות תקלה זו:\n• מה המאפיינים הייחודיים שלה?\n• באיזה שעות היא מופיעה בדרך כלל?\n• מה ההבדל בינה לבין תקלה אחרת?\n• דוגמאות מהשטח`}
              rows={4}
              className="text-sm resize-none"
            />
          </div>

          {/* Reference Images */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <ImagePlus className="w-4 h-4 text-slate-400" />
              <span>תמונות לדוגמה</span>
              <span className="text-xs font-normal text-slate-400">(גרפים, צילומי מסך של התקלה)</span>
            </Label>
            <div className="flex flex-wrap gap-3">
              {(form.reference_images || []).map((url, idx) => (
                <div key={idx} className="relative group w-32 h-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                  <img src={url} alt={`תמונה ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 left-1 bg-white/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                  >
                    <XCircle className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}
              <label className="w-32 h-24 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-green-400 hover:bg-green-50/50 transition-colors">
                <ImagePlus className="w-5 h-5 text-slate-400" />
                <span className="text-[11px] text-slate-400">{uploading ? 'מעלה...' : 'הוסף תמונה'}</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={uploading} />
              </label>
            </div>
          </div>

          {/* Detection Rules */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical className="w-4 h-4 text-blue-500" />
              <span className="font-semibold text-slate-700 text-sm">תנאי זיהוי אוטומטי</span>
            </div>
            <DetectionRulesEditor
              rules={form.detection_rules || []}
              logic={form.detection_logic || 'all'}
              consecutiveChecks={form.consecutive_checks_required || 2}
              onChange={({ rules, logic, consecutiveChecks }) => {
                setForm(f => ({
                  ...f,
                  detection_rules: rules,
                  detection_logic: logic,
                  consecutive_checks_required: consecutiveChecks
                }));
              }}
            />
          </div>

          {/* Notifications */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="font-semibold text-slate-700 text-sm">התראות עתידיות</div>
            <div className="flex flex-wrap gap-3">
              <Toggle checked={form.notify_email} onChange={v => set('notify_email', v)} label="מייל" icon={Mail} />
              <Toggle checked={form.notify_whatsapp} onChange={v => set('notify_whatsapp', v)} label="ווצאפ" icon={MessageSquare} />
              <Toggle checked={form.notify_phone} onChange={v => set('notify_phone', v)} label="שיחת טלפון" icon={Phone} />
            </div>
            {form.notify_email && (
              <div className="space-y-1">
                <Label>תבנית הודעת מייל</Label>
                <Textarea value={form.email_template} onChange={e => set('email_template', e.target.value)} placeholder="הודעת המייל שתישלח... ניתן להשתמש ב {site_name}, {fault_type}, {timestamp}" rows={2} />
              </div>
            )}
            {form.notify_whatsapp && (
              <div className="space-y-1">
                <Label>תבנית הודעת ווצאפ</Label>
                <Textarea
                  value={form.whatsapp_template}
                  onChange={e => set('whatsapp_template', e.target.value)}
                  placeholder={`תאר את הודעת הווצאפ שתישלח. ניתן להשתמש במשתנים:\n{site_name} - שם האתר\n{fault_type} - סוג התקלה\n{message} - פירוט התקלה\n{contact_name} - שם הלקוח\n{solution} - הפתרון המוצע\n{timestamp} - זמן הזיהוי\n{severity} - רמת חומרה\n\nאם ריק - תישלח הודעה ברירת מחדל`}
                  rows={6}
                  className="text-sm font-mono"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={!form.name || createMutation.isPending || updateMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white gap-2">
              <Check className="w-4 h-4" />
              {editing ? 'שמור שינויים' : 'צור תקלה'}
            </Button>
            <Button variant="outline" onClick={closeForm}>ביטול</Button>
          </div>
        </Card>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center text-slate-400 py-12">טוען...</div>
      ) : faultTypes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
          <p className="text-slate-400 text-sm mb-3">אין סוגי תקלות מוגדרים עדיין</p>
          <Button onClick={openNew} variant="outline" className="gap-2 text-green-600 border-green-200">
            <Plus className="w-4 h-4" /> הוסף תקלה ראשונה
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {[...faultTypes].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).map(ft => (
            <Card key={ft.id} className={`p-5 border shadow-sm bg-white ${!ft.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-slate-800">{ft.name}</span>
                    <Badge className={`${SEVERITY_COLORS[ft.severity]} border-0 shadow-none text-xs font-normal`}>
                      {SEVERITY_LABELS[ft.severity]}
                    </Badge>
                    <Badge variant="outline" className="text-xs font-normal text-slate-500">
                      {ALERT_TYPE_LABELS[ft.alert_type] || ft.alert_type}
                    </Badge>
                    {!ft.is_active && <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">לא פעיל</Badge>}
                  </div>
                  {ft.description && <p className="text-sm text-slate-600 mb-1">{ft.description}</p>}
                  {ft.solution && (
                    <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5 mt-2 border border-green-100">
                      <span className="font-semibold">פתרון: </span>{ft.solution}
                    </div>
                  )}
                  {ft.detection_rules?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ft.detection_rules.map((r, i) => (
                        <span key={i} className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-0.5">
                          {r.description || `${r.metric} ${r.operator} ${r.value_string || r.value}`}
                        </span>
                      ))}
                      <span className="text-[11px] bg-slate-50 text-slate-500 border border-slate-100 rounded-full px-2 py-0.5">
                        {ft.detection_logic === 'any' ? 'OR' : 'AND'} · {ft.consecutive_checks_required || 2} בדיקות עוקבות
                      </span>
                    </div>
                  )}
                  {ft.reference_images?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {ft.reference_images.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-20 h-14 rounded-md overflow-hidden border border-slate-200 hover:border-green-400 transition-colors">
                          <img src={url} alt={`דוגמה ${i + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      {String(ft.check_hour_from ?? 6).padStart(2,'0')}:00 - {String(ft.check_hour_to ?? 20).padStart(2,'0')}:00
                    </div>
                    {ft.notify_email && <div className="flex items-center gap-1 text-xs text-slate-500"><Mail className="w-3 h-3" /> מייל</div>}
                    {ft.notify_whatsapp && <div className="flex items-center gap-1 text-xs text-slate-500"><MessageSquare className="w-3 h-3" /> ווצאפ</div>}
                    {ft.notify_phone && <div className="flex items-center gap-1 text-xs text-slate-500"><Phone className="w-3 h-3" /> טלפון</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(ft)} className="text-slate-400 hover:text-slate-700">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(ft.id)} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}