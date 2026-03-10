import React from 'react';
import { Input } from '@/components/ui/input';

export default function StringPortMapPanel({ strings, stringColors, panelCounts, onChangePort, activeStringId, onSelectString }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-bold text-sm text-slate-900">שיוך סטרינג ליציאת ממיר</h3>
        <p className="text-[11px] text-slate-500 mt-1">לדוגמה: PV3 / MPPT3 / PV6</p>
      </div>

      <div className="space-y-2">
        {strings.map((s) => (
          <button
            key={s.string_id}
            type="button"
            onClick={() => onSelectString?.(s.string_id)}
            className={`w-full rounded-lg border p-2.5 text-right transition-colors ${activeStringId === s.string_id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: stringColors[s.string_id] }} />
                <span className="text-xs font-bold text-slate-900">{s.string_id}</span>
              </div>
              <span className="text-[10px] text-slate-500">{panelCounts[s.string_id] || 0}/{s.num_panels || 0}</span>
            </div>
            <Input
              value={s.inverter_port || ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onChangePort(s.string_id, e.target.value)}
              placeholder="PV1"
              className="h-8 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </button>
        ))}
      </div>
    </div>
  );
}