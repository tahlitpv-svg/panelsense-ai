import React from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";

export default function PanelSettings({ panelWatt, panelVoltage, panelAmperage, onChange }) {
  return (
    <Card className="p-5 border border-slate-200 shadow-sm bg-white">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-blue-50">
          <Zap className="w-4 h-4 text-blue-600" />
        </div>
        <h3 className="text-base font-bold text-slate-800">מפרט פאנל</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
  );
}