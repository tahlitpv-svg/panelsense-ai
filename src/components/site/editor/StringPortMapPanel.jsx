import React from 'react';
import { Input } from '@/components/ui/input';

export default function StringPortMapPanel({ strings, stringColors, panelCounts, onChangePort }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-bold text-sm text-white">שיוך סטרינג ליציאת ממיר</h3>
        <p className="text-[11px] text-slate-500 mt-1">לדוגמה: PV3 / MPPT3 / PV6</p>
      </div>

      <div className="space-y-2">
        {strings.map((s) => (
          <div key={s.string_id} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: stringColors[s.string_id] }} />
                <span className="text-xs font-bold text-white">{s.string_id}</span>
              </div>
              <span className="text-[10px] text-slate-500">{panelCounts[s.string_id] || 0}/{s.num_panels || 0}</span>
            </div>
            <Input
              value={s.inverter_port || ''}
              onChange={(e) => onChangePort(s.string_id, e.target.value)}
              placeholder="PV1"
              className="h-8 border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
            />
          </div>
        ))}
      </div>
    </div>
  );
}