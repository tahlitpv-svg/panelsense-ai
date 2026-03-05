import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Cable } from "lucide-react";

const ORIENTATIONS = [
  { value: 'south', label: 'דרום' },
  { value: 'north', label: 'צפון' },
  { value: 'east', label: 'מזרח' },
  { value: 'west', label: 'מערב' },
  { value: 'south-east', label: 'דרום-מזרח' },
  { value: 'south-west', label: 'דרום-מערב' },
  { value: 'north-east', label: 'צפון-מזרח' },
  { value: 'north-west', label: 'צפון-מערב' },
];

const ORIENTATION_LABELS = Object.fromEntries(ORIENTATIONS.map(o => [o.value, o.label]));

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function StringConfigTable({ strings, panelWatt, panelVoltage, panelAmperage, onChange }) {
  // Fetch global settings to get expected kWh/kWp per orientation
  const { data: systemSettings } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const result = await base44.entities.SystemSettings.list();
      return result[0] || null;
    }
  });
  const pw = Number(panelWatt) || 0;
  const pv = Number(panelVoltage) || 0;
  const pa = Number(panelAmperage) || 0;

  // Helper: compute values in real-time from panel specs
  const calc = (s) => {
    const n = Number(s.num_panels) || 0;
    const power_w = n * pw;
    const voltage = n * pv;
    return {
      voltage: parseFloat(voltage.toFixed(1)),
      amperage: pa,
      power_w: parseFloat(power_w.toFixed(1)),
    };
  };

  const addString = () => {
    const nextNum = (strings || []).length + 1;
    const newString = {
      string_id: `S${nextNum}`,
      num_panels: 0,
      orientation: 'south',
      expected_voltage: 0,
      expected_amperage: panelAmperage || 0,
      expected_power_w: 0,
    };
    onChange([...(strings || []), newString]);
  };

  const removeString = (idx) => {
    const updated = [...(strings || [])];
    updated.splice(idx, 1);
    onChange(updated);
  };

  const updateString = (idx, field, value) => {
    const updated = [...(strings || [])];
    updated[idx] = { ...updated[idx], [field]: value };

    // Recalculate expected values when num_panels changes
    if (field === 'num_panels') {
      const numPanels = parseInt(value) || 0;
      updated[idx].num_panels = numPanels;
      updated[idx].expected_voltage = parseFloat((numPanels * (parseFloat(panelVoltage) || 0)).toFixed(1));
      updated[idx].expected_amperage = parseFloat(panelAmperage) || 0;
      updated[idx].expected_power_w = numPanels * (parseFloat(panelWatt) || 0);
    }

    onChange(updated);
  };

  // Calculate totals dynamically from panel specs
  const totalPanels = (strings || []).reduce((sum, s) => sum + (parseInt(s.num_panels) || 0), 0);
  const totalPowerW = (strings || []).reduce((sum, s) => sum + calc(s).power_w, 0);
  const totalPowerKw = totalPowerW / 1000;

  // Calculate expected daily yield based on global settings (kWh per kWp per orientation)
  let totalDailyKwh = 0;
  let totalAnnualKwh = 0;
  if (systemSettings?.orientation_kwh_per_kwp) {
    totalAnnualKwh = (strings || []).reduce((sum, s) => {
      const kwp = calc(s).power_w / 1000;
      const orientation = s.orientation || 'south';
      const annualKwhPerKwp = parseFloat(systemSettings.orientation_kwh_per_kwp[orientation]) || 0;
      return sum + (kwp * annualKwhPerKwp);
    }, 0);
    totalDailyKwh = totalAnnualKwh / 365;
  }

  const MONTHS = [
    { num: 1, name: 'ינואר', days: 31 },
    { num: 2, name: 'פברואר', days: 28 },
    { num: 3, name: 'מרץ', days: 31 },
    { num: 4, name: 'אפריל', days: 30 },
    { num: 5, name: 'מאי', days: 31 },
    { num: 6, name: 'יוני', days: 30 },
    { num: 7, name: 'יולי', days: 31 },
    { num: 8, name: 'אוגוסט', days: 31 },
    { num: 9, name: 'ספטמבר', days: 30 },
    { num: 10, name: 'אוקטובר', days: 31 },
    { num: 11, name: 'נובמבר', days: 30 },
    { num: 12, name: 'דצמבר', days: 31 },
  ];

  return (
    <Card className="p-5 border border-slate-200 shadow-sm bg-white">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-purple-50">
            <Cable className="w-4 h-4 text-purple-600" />
          </div>
          <h3 className="text-base font-bold text-slate-800">הגדרת סטרינגים</h3>
        </div>
        <Button size="sm" variant="outline" onClick={addString} className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" />
          הוסף סטרינג
        </Button>
      </div>

      {(!strings || strings.length === 0) ? (
        <div className="text-center py-8 text-slate-400 text-sm border border-dashed border-slate-200 rounded-lg">
          לא הוגדרו סטרינגים. לחץ "הוסף סטרינג" כדי להתחיל.
        </div>
      ) : (
        <>
          {/* Mobile: Cards layout */}
          <div className="space-y-3 md:hidden">
            {strings.map((s, idx) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <Input
                    value={s.string_id || ''}
                    onChange={(e) => updateString(idx, 'string_id', e.target.value)}
                    className="w-20 h-8 text-sm font-bold border-slate-200"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeString(idx)} className="w-7 h-7 text-red-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500">כמות פאנלים</span>
                    <Input
                      type="number"
                      value={s.num_panels || ''}
                      onChange={(e) => updateString(idx, 'num_panels', e.target.value)}
                      className="h-8 text-sm border-slate-200"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500">כיוון</span>
                    <Select value={s.orientation || 'south'} onValueChange={(v) => updateString(idx, 'orientation', v)}>
                      <SelectTrigger className="h-8 text-sm border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORIENTATIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200 text-center">
                  <div>
                    <div className="text-[10px] text-slate-400">מתח צפוי</div>
                    <div className="text-xs font-bold text-slate-700">{calc(s).voltage} V</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">זרם צפוי</div>
                    <div className="text-xs font-bold text-slate-700">{calc(s).amperage.toFixed(1)} A</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">הספק</div>
                    <div className="text-xs font-bold text-slate-700">{(calc(s).power_w / 1000).toFixed(2)} kW</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-right py-2 px-2 text-xs font-medium text-slate-500">מזהה</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-slate-500">פאנלים</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-slate-500">כיוון</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-slate-500">מתח צפוי (V)</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-slate-500">זרם צפוי (A)</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-slate-500">הספק (kW)</th>
                  <th className="py-2 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {strings.map((s, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-2 px-2">
                      <Input
                        value={s.string_id || ''}
                        onChange={(e) => updateString(idx, 'string_id', e.target.value)}
                        className="h-8 w-20 text-sm font-bold border-slate-200"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Input
                        type="number"
                        value={s.num_panels || ''}
                        onChange={(e) => updateString(idx, 'num_panels', e.target.value)}
                        className="h-8 w-20 text-sm border-slate-200"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <Select value={s.orientation || 'south'} onValueChange={(v) => updateString(idx, 'orientation', v)}>
                        <SelectTrigger className="h-8 w-32 text-sm border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORIENTATIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-2">
                      <span className="font-medium text-slate-700">{calc(s).voltage}</span>
                    </td>
                    <td className="py-2 px-2">
                      <span className="font-medium text-slate-700">{calc(s).amperage.toFixed(1)}</span>
                    </td>
                    <td className="py-2 px-2">
                      <span className="font-bold text-slate-800">{(calc(s).power_w / 1000).toFixed(2)}</span>
                    </td>
                    <td className="py-2 px-2">
                      <Button variant="ghost" size="icon" onClick={() => removeString(idx)} className="w-7 h-7 text-red-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">סה״כ סטרינגים</div>
              <div className="text-sm font-bold text-slate-800">{strings.length}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">סה״כ פאנלים</div>
              <div className="text-sm font-bold text-slate-800">{totalPanels}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">סה״כ הספק</div>
              <div className="text-sm font-bold text-slate-800">{totalPowerKw.toFixed(2)} kWp</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">ייצור יומי צפוי (ממוצע שנתי)</div>
              <div className="text-sm font-bold text-green-700">{totalDailyKwh.toFixed(1)} kWh</div>
            </div>
          </div>

          {/* Monthly Expected Production Table */}
          {totalAnnualKwh > 0 && Object.keys(globalMonthlyPercentages).length > 0 && (
            <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 p-3 border-b border-slate-200 font-bold text-slate-700 text-sm">
                צפי ייצור חודשי ויומי
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center" dir="rtl">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2 px-2 font-medium">חודש</th>
                      <th className="py-2 px-2 font-medium">אחוז שנתי</th>
                      <th className="py-2 px-2 font-medium">צפי ייצור חודשי (kWh)</th>
                      <th className="py-2 px-2 font-medium">צפי ייצור יומי (kWh)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHS.map(m => {
                      const pct = parseFloat(globalMonthlyPercentages[m.num]) || 0;
                      const monthKwh = totalAnnualKwh * (pct / 100);
                      const dailyKwh = monthKwh / m.days;
                      return (
                        <tr key={m.num} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                          <td className="py-2 px-2 font-medium text-slate-800">{m.name}</td>
                          <td className="py-2 px-2 text-slate-600">{pct}%</td>
                          <td className="py-2 px-2 font-bold text-slate-700">{monthKwh.toFixed(0)}</td>
                          <td className="py-2 px-2 font-bold text-green-600">{dailyKwh.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}