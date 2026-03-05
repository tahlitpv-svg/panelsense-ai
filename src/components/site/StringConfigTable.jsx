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

export default function StringConfigTable({ strings, panelWatt, panelVoltage, panelAmperage, peakSunHours, onChange }) {
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
      updated[idx].expected_voltage = parseFloat((numPanels * (panelVoltage || 0)).toFixed(1));
      updated[idx].expected_amperage = panelAmperage || 0;
      updated[idx].expected_power_w = numPanels * (panelWatt || 0);
    }

    onChange(updated);
  };

  // Calculate totals
  const totalPanels = (strings || []).reduce((sum, s) => sum + (s.num_panels || 0), 0);
  const totalPowerKw = (strings || []).reduce((sum, s) => sum + (s.expected_power_w || 0), 0) / 1000;
  const totalDailyKwh = peakSunHours > 0 ? totalPowerKw * peakSunHours : 0;

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
                    <div className="text-xs font-bold text-slate-700">{s.expected_voltage?.toFixed(1) || 0} V</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">זרם צפוי</div>
                    <div className="text-xs font-bold text-slate-700">{s.expected_amperage?.toFixed(1) || 0} A</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">הספק</div>
                    <div className="text-xs font-bold text-slate-700">{((s.expected_power_w || 0) / 1000).toFixed(2)} kW</div>
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
                      <span className="font-medium text-slate-700">{s.expected_voltage?.toFixed(1) || 0}</span>
                    </td>
                    <td className="py-2 px-2">
                      <span className="font-medium text-slate-700">{s.expected_amperage?.toFixed(1) || 0}</span>
                    </td>
                    <td className="py-2 px-2">
                      <span className="font-bold text-slate-800">{((s.expected_power_w || 0) / 1000).toFixed(2)}</span>
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
              <div className="text-[10px] text-slate-400 uppercase">ייצור יומי צפוי</div>
              <div className="text-sm font-bold text-green-700">{totalDailyKwh.toFixed(1)} kWh</div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}