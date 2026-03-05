import React from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sun, Zap, Gauge } from "lucide-react";

export default function PanelSettings({ panelWatt, panelVoltage, panelAmperage, peakSunHours, annualKwhPerKwp, onChange }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Panel Specs */}
      <Card className="p-5 border border-slate-200 shadow-sm bg-white">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-blue-50">
            <Zap className="w-4 h-4 text-blue-600" />
          </div>
          <h3 className="text-base font-bold text-slate-800">מפרט פאנל</h3>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">הספק פאנל (W)</Label>
            <Input
              type="number"
              value={panelWatt || ''}
              onChange={(e) => onChange('panel_watt', parseFloat(e.target.value) || 0)}
              placeholder="650"
              className="border-slate-200"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">מתח Vmp (V)</Label>
            <Input
              type="number"
              step="0.1"
              value={panelVoltage || ''}
              onChange={(e) => onChange('panel_voltage', parseFloat(e.target.value) || 0)}
              placeholder="51"
              className="border-slate-200"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">זרם Imp (A)</Label>
            <Input
              type="number"
              step="0.01"
              value={panelAmperage || ''}
              onChange={(e) => onChange('panel_amperage', parseFloat(e.target.value) || 0)}
              placeholder="16"
              className="border-slate-200"
            />
          </div>
        </div>
      </Card>

      {/* Location Production Settings */}
      <Card className="p-5 border border-slate-200 shadow-sm bg-white">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-orange-50">
            <Sun className="w-4 h-4 text-orange-600" />
          </div>
          <h3 className="text-base font-bold text-slate-800">הגדרות ייצור</h3>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">שעות שמש שיא ביום (PSH)</Label>
            <Input
              type="number"
              step="0.1"
              value={peakSunHours || ''}
              onChange={(e) => onChange('peak_sun_hours', parseFloat(e.target.value) || 0)}
              placeholder="5.5"
              className="border-slate-200"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">kWh שנתי לכל kWp</Label>
            <Input
              type="number"
              value={annualKwhPerKwp || ''}
              onChange={(e) => onChange('annual_kwh_per_kwp', parseFloat(e.target.value) || 0)}
              placeholder="1700"
              className="border-slate-200"
            />
          </div>
          {panelWatt > 0 && peakSunHours > 0 && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-1.5 mb-1">
                <Gauge className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-medium text-green-700">ייצור צפוי לפאנל</span>
              </div>
              <div className="text-sm font-bold text-green-800">
                {((panelWatt / 1000) * peakSunHours).toFixed(2)} kWh / יום
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}