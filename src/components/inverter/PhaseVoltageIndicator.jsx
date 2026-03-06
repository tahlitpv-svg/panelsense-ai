import React from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';

const PHASE_LABELS = ['L1', 'L2', 'L3'];
const V_MIN = 220;
const V_MAX = 250;

export default function PhaseVoltageIndicator({ voltages }) {
  // voltages: { l1: number, l2: number, l3: number }
  if (!voltages || (!voltages.l1 && !voltages.l2 && !voltages.l3)) {
    return (
      <div className="text-xs text-slate-400 italic">אין נתוני פאזות</div>
    );
  }

  const phases = [
    { label: 'L1', value: voltages.l1 },
    { label: 'L2', value: voltages.l2 },
    { label: 'L3', value: voltages.l3 },
  ];

  return (
    <div className="flex items-center gap-3">
      {phases.map(({ label, value }) => {
        const ok = value >= V_MIN && value <= V_MAX;
        const hasValue = value > 0;
        return (
          <div key={label} className="flex items-center gap-1">
            <span className="text-xs font-semibold text-slate-500">{label}</span>
            <span className={`text-xs font-mono font-bold ${hasValue ? (ok ? 'text-slate-700' : 'text-red-600') : 'text-slate-300'}`}>
              {hasValue ? `${value.toFixed(0)}V` : '--'}
            </span>
            {hasValue && (
              ok
                ? <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                : <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}