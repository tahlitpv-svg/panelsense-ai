import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Plus, Wifi, WifiOff, RefreshCw, Trash2, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, Settings, Zap, Pencil
} from 'lucide-react';

const PROVIDERS = [
  {
    id: 'solis',
    name: 'Solis Cloud',
    logo: '☀️',
    color: 'orange',
    description: 'Solis / Ginlong - מחובר כבר דרך מפתחות המערכת',
    fields: [
      { key: 'key_id', label: 'API Key ID', placeholder: 'השאר ריק לשימוש במפתח המערכת', sensitive: false },
      { key: 'key_secret', label: 'API Key Secret', placeholder: 'השאר ריק לשימוש במפתח המערכת', sensitive: true },
      { key: 'api_url', label: 'API URL', placeholder: 'https://www.soliscloud.com:13333', sensitive: false }
    ]
  },
  {
    id: 'sungrow',
    name: 'SunGrow iSolarCloud',
    logo: '🌿',
    color: 'green',
    description: 'SunGrow - פורטל מפתחים של iSolarCloud (OAuth 2.0)',
    fields: [
      { key: 'app_key', label: 'App Key', placeholder: 'מפתח האפליקציה מפורטל המפתחים', sensitive: false },
      { key: 'app_secret', label: 'App Secret', placeholder: 'הסוד של האפליקציה', sensitive: true },
      { key: 'user_account', label: 'User Account', placeholder: 'שם משתמש iSolarCloud', sensitive: false },
      { key: 'user_password', label: 'User Password', placeholder: 'סיסמת iSolarCloud', sensitive: true },
      { key: 'base_url', label: 'Base URL', placeholder: 'https://gateway.isolarcloud.com.hk', sensitive: false }
    ],
    link: { url: 'https://developer-api.isolarcloud.com/', label: 'פורטל מפתחים של SunGrow →' }
  },
  {
    id: 'huawei_fusionsolar',
    name: 'Huawei FusionSolar',
    logo: '🔵',
    color: 'blue',
    description: 'Huawei - FusionSolar Northbound API',
    fields: [
      { key: 'username', label: 'System Code', placeholder: 'System code מ-FusionSolar', sensitive: false },
      { key: 'password', label: 'Password', placeholder: 'סיסמה', sensitive: true },
      { key: 'base_url', label: 'Base URL', placeholder: 'https://intl.fusionsolar.huawei.com', sensitive: false }
    ]
  },
  {
    id: 'solaredge',
    name: 'SolarEdge',
    logo: '⚡',
    color: 'yellow',
    description: 'SolarEdge - Monitoring API',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'מפתח API מ-SolarEdge Dashboard', sensitive: true }
    ]
  },
  {
    id: 'fronius',
    name: 'Fronius Solar.web',
    logo: '🟡',
    color: 'yellow',
    description: 'Fronius - Solar.web API',
    fields: [
      { key: 'access_key_id', label: 'Access Key ID', placeholder: 'Access Key ID', sensitive: false },
      { key: 'access_key_value', label: 'Access Key Value', placeholder: 'Access Key Value', sensitive: true }
    ]
  },
  {
    id: 'custom',
    name: 'API מותאם אישית',
    logo: '🔧',
    color: 'slate',
    description: 'חיבור לכל API חיצוני אחר',
    fields: [
      { key: 'base_url', label: 'Base URL', placeholder: 'https://api.example.com', sensitive: false },
      { key: 'api_key', label: 'API Key / Token', placeholder: 'מפתח גישה', sensitive: true },
      { key: 'username', label: 'שם משתמש (אופציונלי)', placeholder: '', sensitive: false },
      { key: 'password', label: 'סיסמה (אופציונלי)', placeholder: '', sensitive: true }
    ]
  }
];

const STATUS_CONFIG = {
  connected: { label: 'מחובר', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
  error: { label: 'שגיאה', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  pending: { label: 'בבדיקה...', icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  not_tested: { label: 'לא נבדק', icon: Clock, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' }
};

function ConnectionCard({ conn, onTest, onDelete, onEdit, isTestingId }) {
  const [expanded, setExpanded] = useState(false);
  const provider = PROVIDERS.find(p => p.id === conn.provider) || PROVIDERS[PROVIDERS.length - 1];
  const status = STATUS_CONFIG[conn.status || 'not_tested'];
  const StatusIcon = status.icon;
  const isTesting = isTestingId === conn.id;

  return (
    <Card className={`border ${status.border} transition-all`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{provider.logo}</span>
            <div>
              <div className="font-semibold text-slate-900">{conn.name}</div>
              <div className="text-xs text-slate-500">{provider.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${status.bg} ${status.color} border-0 gap-1 text-xs font-medium`}>
              <StatusIcon className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
              {isTesting ? 'בודק...' : status.label}
            </Badge>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        {conn.last_tested && (
          <div className="text-xs text-slate-400 mt-1">
            נבדק לאחרונה: {new Date(conn.last_tested).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}
          </div>
        )}
        {conn.error_message && (
          <div className="text-xs text-red-600 bg-red-50 rounded p-2 mt-2">{conn.error_message}</div>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 border-t border-slate-100">
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            {provider.fields.map(f => (
              <div key={f.key}>
                <span className="text-slate-500">{f.label}:</span>{' '}
                <span className="text-slate-700 font-medium">
                  {conn.config?.[f.key]
                    ? (f.sensitive ? '••••••••' : conn.config[f.key])
                    : <span className="text-slate-400 italic">לא הוגדר</span>}
                </span>
              </div>
            ))}
          </div>
          {conn.notes && <div className="text-xs text-slate-500 mt-3 italic">{conn.notes}</div>}
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={() => onTest(conn.id)} disabled={isTesting} className="gap-1 bg-green-600 hover:bg-green-700">
              <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
              בדוק חיבור
            </Button>
            <Button size="sm" variant="outline" onClick={() => onEdit(conn)} className="gap-1">
              <Pencil className="w-3 h-3" />
              ערוך
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onDelete(conn.id)} className="gap-1">
              <Trash2 className="w-3 h-3" />
              מחק
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function EditConnectionForm({ conn, onSave, onCancel }) {
  const provider = PROVIDERS.find(p => p.id === conn.provider) || PROVIDERS[PROVIDERS.length - 1];
  const [form, setForm] = useState({
    name: conn.name || '',
    config: { ...conn.config },
    notes: conn.notes || ''
  });

  const handleSave = () => {
    onSave(conn.id, { name: form.name, config: form.config, notes: form.notes, status: 'not_tested' });
  };

  return (
    <Card className="border-2 border-dashed border-blue-300 bg-blue-50/20">
      <CardHeader>
        <CardTitle className="text-base text-blue-800 flex items-center gap-2">
          <Pencil className="w-4 h-4" /> עריכת חיבור: {conn.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-sm text-slate-700">שם לחיבור</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
        </div>
        {provider.fields.map(f => (
          <div key={f.key}>
            <Label className="text-xs text-slate-500">{f.label}</Label>
            <Input
              type={f.sensitive ? 'password' : 'text'}
              value={form.config[f.key] || ''}
              onChange={e => setForm(f2 => ({ ...f2, config: { ...f2.config, [f.key]: e.target.value } }))}
              placeholder={f.placeholder}
              className="mt-1 text-sm"
              dir="ltr"
            />
          </div>
        ))}
        <div>
          <Label className="text-xs text-slate-500">הערות (אופציונלי)</Label>
          <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 text-sm" />
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={!form.name} className="bg-blue-600 hover:bg-blue-700">
            <Pencil className="w-4 h-4 mr-1" /> שמור שינויים
          </Button>
          <Button variant="outline" onClick={onCancel}>ביטול</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddConnectionForm({ onSave, onCancel }) {
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [form, setForm] = useState({ name: '', config: {}, notes: '' });

  const provider = PROVIDERS.find(p => p.id === selectedProvider);

  const handleSave = () => {
    if (!selectedProvider || !form.name) return;
    onSave({ provider: selectedProvider, name: form.name, config: form.config, notes: form.notes, status: 'not_tested' });
  };

  return (
    <Card className="border-2 border-dashed border-green-300 bg-green-50/30">
      <CardHeader>
        <CardTitle className="text-base text-green-800">הוספת חיבור API חדש</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-sm font-medium text-slate-700 mb-2 block">בחר ספק</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProvider(p.id)}
                className={`p-3 rounded-lg border text-right transition-all text-sm ${
                  selectedProvider === p.id
                    ? 'border-green-500 bg-green-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-lg mb-1">{p.logo}</div>
                <div className="font-medium text-slate-900 text-xs">{p.name}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-tight">{p.description.split('-')[1]?.trim() || ''}</div>
              </button>
            ))}
          </div>
        </div>

        {selectedProvider && (
          <>
            <div>
              <Label className="text-sm text-slate-700">שם לחיבור</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={`לדוגמה: ${provider?.name} - לקוח X`}
                className="mt-1"
              />
            </div>

            {provider?.link && (
              <a href={provider.link.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                🔗 {provider.link.label}
              </a>
            )}

            <div className="space-y-3">
              <Label className="text-sm text-slate-700 block">פרטי חיבור</Label>
              {provider?.fields.map(f => (
                <div key={f.key}>
                  <Label className="text-xs text-slate-500">{f.label}</Label>
                  <Input
                    type={f.sensitive ? 'password' : 'text'}
                    value={form.config[f.key] || ''}
                    onChange={e => setForm(f2 => ({ ...f2, config: { ...f2.config, [f.key]: e.target.value } }))}
                    placeholder={f.placeholder}
                    className="mt-1 text-sm"
                    dir="ltr"
                  />
                </div>
              ))}
            </div>

            <div>
              <Label className="text-xs text-slate-500">הערות (אופציונלי)</Label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="הערות נוספות על החיבור"
                className="mt-1 text-sm"
              />
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={!selectedProvider || !form.name} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> שמור חיבור
          </Button>
          <Button variant="outline" onClick={onCancel}>ביטול</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ApiConnectionsTab() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editingConn, setEditingConn] = useState(null);
  const [testingId, setTestingId] = useState(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['apiConnections'],
    queryFn: () => base44.entities.ApiConnection.list()
  });

  const createMutation = useMutation({
    mutationFn: data => base44.entities.ApiConnection.create(data),
    onSuccess: () => { queryClient.invalidateQueries(['apiConnections']); setShowAdd(false); }
  });

  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.ApiConnection.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['apiConnections'])
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ApiConnection.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(['apiConnections']); setEditingConn(null); }
  });

  const handleTest = async (connId) => {
    setTestingId(connId);
    try {
      await base44.functions.invoke('testApiConnection', { connection_id: connId });
      queryClient.invalidateQueries(['apiConnections']);
    } finally {
      setTestingId(null);
    }
  };

  const connected = connections.filter(c => c.status === 'connected').length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-green-600" />
            חיבורי API
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            חבר ספקי מערכות סולאריות שונים — כל לקוח יכול להיות עם API אחר
          </p>
        </div>
        <div className="flex items-center gap-3">
          {connections.length > 0 && (
            <span className="text-sm text-slate-500">
              {connected}/{connections.length} מחוברים
            </span>
          )}
          <Button onClick={() => setShowAdd(true)} disabled={showAdd} className="bg-green-600 hover:bg-green-700 gap-2">
            <Plus className="w-4 h-4" /> הוסף חיבור
          </Button>
        </div>
      </div>

      {/* Supported providers banner */}
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map(p => (
          <div key={p.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600">
            <span>{p.logo}</span>
            <span>{p.name}</span>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddConnectionForm
          onSave={data => createMutation.mutate(data)}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editingConn && (
        <EditConnectionForm
          conn={editingConn}
          onSave={(id, data) => updateMutation.mutate({ id, data })}
          onCancel={() => setEditingConn(null)}
        />
      )}

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">טוען חיבורים...</div>
      ) : connections.length === 0 && !showAdd ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="text-center py-12">
            <Settings className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">אין חיבורי API מוגדרים</p>
            <p className="text-slate-400 text-sm mt-1">לחץ "הוסף חיבור" כדי לחבר ספק נתונים</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map(conn => (
            <ConnectionCard
              key={conn.id}
              conn={conn}
              onTest={handleTest}
              onDelete={id => deleteMutation.mutate(id)}
              isTestingId={testingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}