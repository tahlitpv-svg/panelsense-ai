import React from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, CalendarDays, Compass } from "lucide-react";

export const ORIENTATIONS = [
  { value: 'south', label: 'דרום' },
  { value: 'north', label: 'צפון' },
  { value: 'east', label: 'מזרח' },
  { value: 'west', label: 'מערב' },
  { value: 'south-east', label: 'דרום-מזרח' },
  { value: 'south-west', label: 'דרום-מערב' },
  { value: 'north-east', label: 'צפון-מזרח' },
  { value: 'north-west', label: 'צפון-מערב' },
];

const MONTHS = [
  { value: '1', label: 'ינואר' },
  { value: '2', label: 'פברואר' },
  { value: '3', label: 'מרץ' },
  { value: '4', label: 'אפריל' },
  { value: '5', label: 'מאי' },
  { value: '6', label: 'יוני' },
  { value: '7', label: 'יולי' },
  { value: '8', label: 'אוגוסט' },
  { value: '9', label: 'ספטמבר' },
  { value: '10', label: 'אוקטובר' },
  { value: '11', label: 'נובמבר' },
  { value: '12', label: 'דצמבר' },
];

export default function AssumptionsSettings({ monthlyProductionPercentages, orientationKwhPerKwp, onChange }) {
  const mpp = monthlyProductionPercentages || {};
  const okpk = orientationKwhPerKwp || {};

  const handleMonthChange = (month, val) => {
    onChange('monthly_production_percentages', { ...mpp, [month]: val === '' ? '' : parseFloat(val) || 0 });
  };

  const handleOrientationChange = (orientation, val) => {
    onChange('orientation_kwh_per_kwp', { ...okpk, [orientation]: val === '' ? '' : parseFloat(val) || 0 });
  };

  const totalPercentage = Object.values(mpp).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

  return (
    <div className="space-y-6">
      <Card className="p-5 border border-slate-200 shadow-sm bg-white">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-orange-50">
            <Compass className="w-4 h-4 text-orange-600" />
          </div>
          <h3 className="text-base font-bold text-slate-800">קוט"ש / קילוואט לפי כיוון (שנתי)</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {ORIENTATIONS.map(o => (
            <div key={o.value} className="space-y-1">
              <Label className="text-xs text-slate-500">{o.label}</Label>
              <Input
                type="number"
                value={okpk[o.value] === undefined ? '' : okpk[o.value]}
                onChange={(e) => handleOrientationChange(o.value, e.target.value)}
                placeholder="למשל 1750"
                className="border-slate-200"
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 border border-slate-200 shadow-sm bg-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-50">
              <CalendarDays className="w-4 h-4 text-indigo-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800">אחוזי ייצור חודשיים (%)</h3>
          </div>
          <div className={`text-sm font-bold px-3 py-1 rounded-full ${Math.abs(totalPercentage - 100) < 0.1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            סה"כ: {totalPercentage.toFixed(1)}%
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {MONTHS.map(m => (
            <div key={m.value} className="space-y-1">
              <Label className="text-xs text-slate-500">{m.label}</Label>
              <Input
                type="number"
                step="0.1"
                value={mpp[m.value] === undefined ? '' : mpp[m.value]}
                onChange={(e) => handleMonthChange(m.value, e.target.value)}
                placeholder="למשל 8.5"
                className="border-slate-200"
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}