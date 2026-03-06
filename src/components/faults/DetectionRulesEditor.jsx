import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Info } from 'lucide-react';

const METRIC_LABELS = {
  current_power_kw: 'הספק נוכחי (kW)',
  daily_yield_kwh: 'ייצור יומי (kWh)',
  current_efficiency: 'יעילות נוכחית (%)',
  phase_voltage_l1: 'מתח פאזה L1 (V)',
  phase_voltage_l2: 'מתח פאזה L2 (V)',
  phase_voltage_l3: 'מתח פאזה L3 (V)',
  inverter_status: 'סטטוס ממיר',
  site_status: 'סטטוס אתר',
  mppt_string_voltage: 'מתח סטרינג MPPT (V)',
  mppt_string_current: 'זרם סטרינג MPPT (A)',
  temperature_c: 'טמפרטורת ממיר (°C)',
  last_heartbeat_minutes_ago: 'דקות מאז עדכון אחרון'
};

const OPERATOR_LABELS = {
  less_than: 'קטן מ-',
  greater_than: 'גדול מ-',
  equals: 'שווה ל-',
  not_equals: 'שונה מ-',
  less_than_percent_of_expected: '% מהצפוי פחות מ-'
};

const STRING_METRICS = ['inverter_status', 'site_status'];
const STATUS_VALUES = { inverter_status: ['online', 'warning', 'offline'], site_status: ['online', 'warning', 'offline'] };

const EMPTY_RULE = {
  metric: 'current_power_kw',
  operator: 'less_than',
  value: 0,
  value_string: '',
  description: ''
};

export default function DetectionRulesEditor({ rules = [], logic = 'all', consecutiveChecks = 2, checkDaylight = true, onChange }) {

  const updateRules = (newRules) => onChange({ rules: newRules, logic, consecutiveChecks, checkDaylight });
  const updateLogic = (v) => onChange({ rules, logic: v, consecutiveChecks, checkDaylight });
  const updateConsecutive = (v) => onChange({ rules, logic, consecutiveChecks: Number(v), checkDaylight });
  const updateDaylight = (v) => onChange({ rules, logic, consecutiveChecks, checkDaylight: v });

  const addRule = () => updateRules([...rules, { ...EMPTY_RULE }]);
  const removeRule = (i) => updateRules(rules.filter((_, idx) => idx !== i));
  const updateRule = (i, key, val) => {
    const updated = rules.map((r, idx) => idx === i ? { ...r, [key]: val } : r);
    updateRules(updated);
  };

  const isStringMetric = (metric) => STRING_METRICS.includes(metric);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">חוקי זיהוי תקלה</span>
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-2 py-0.5">{rules.length} חוקים</span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRule} className="gap-1 text-green-700 border-green-200 hover:bg-green-50">
          <Plus className="w-3.5 h-3.5" /> הוסף תנאי
        </Button>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>המערכת תבדוק את התנאים כל 30 דקות. כאשר התנאים מתקיימים במספר בדיקות עוקבות – תישלח התראה.</span>
      </div>

      {rules.length === 0 && (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400">
          לא הוגדרו תנאי זיהוי — התראה תישלח ידנית בלבד
        </div>
      )}

      {/* Rules */}
      <div className="space-y-3">
        {rules.map((rule, i) => (
          <div key={i} className="border border-slate-200 rounded-lg p-3 bg-white space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">תנאי {i + 1}</span>
              <Button type="button" variant="ghost" size="icon" className="w-6 h-6 text-slate-300 hover:text-red-500" onClick={() => removeRule(i)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Metric */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">מדד</Label>
                <Select value={rule.metric} onValueChange={v => updateRule(i, 'metric', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METRIC_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Operator */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">תנאי</Label>
                <Select value={rule.operator} onValueChange={v => updateRule(i, 'operator', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Value */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">ערך</Label>
                {isStringMetric(rule.metric) ? (
                  <Select value={rule.value_string} onValueChange={v => updateRule(i, 'value_string', v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="בחר מצב" /></SelectTrigger>
                    <SelectContent>
                      {(STATUS_VALUES[rule.metric] || []).map(s => (
                        <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={rule.value}
                    onChange={e => updateRule(i, 'value', parseFloat(e.target.value) || 0)}
                  />
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">תיאור קצר (אופציונלי)</Label>
              <Input
                className="h-8 text-xs"
                placeholder="לדוגמה: ממיר לא מייצר חשמל בשעות שיא"
                value={rule.description}
                onChange={e => updateRule(i, 'description', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Logic & settings */}
      {rules.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">לוגיקת תנאים</Label>
            <Select value={logic} onValueChange={updateLogic}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">כל התנאים (AND)</SelectItem>
                <SelectItem value="any" className="text-xs">מספיק תנאי אחד (OR)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">בדיקות עוקבות לפני התראה</Label>
            <Input
              type="number"
              min={1} max={10}
              className="h-8 text-xs"
              value={consecutiveChecks}
              onChange={e => updateConsecutive(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-500">בדיקה בשעות יום בלבד</Label>
            <button
              type="button"
              onClick={() => updateDaylight(!checkDaylight)}
              className={`w-full h-8 flex items-center gap-2 px-3 rounded-md border text-xs font-medium transition-all ${
                checkDaylight ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-400'
              }`}
            >
              <div className={`w-7 h-3.5 rounded-full relative flex-shrink-0 ${checkDaylight ? 'bg-amber-400' : 'bg-slate-200'}`}>
                <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${checkDaylight ? 'right-0.5' : 'left-0.5'}`} />
              </div>
              {checkDaylight ? '06:00–19:00 בלבד' : 'כל שעות היום'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}