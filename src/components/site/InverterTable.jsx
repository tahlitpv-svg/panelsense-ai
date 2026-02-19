import React from "react";
import { Zap, AlertTriangle, WifiOff } from "lucide-react";

const statusConfig = {
  online: { color: "#00ff88", label: "פעיל" },
  warning: { color: "#ffaa00", label: "אזהרה" },
  offline: { color: "#ff3333", label: "לא מקוון" },
};

export default function InverterTable({ inverters, onSelect }) {
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="p-5 border-b border-[#30363d]">
        <h3 className="text-sm font-semibold text-[#e6edf3]">ממירים</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#8b949e] border-b border-[#30363d]">
              <th className="text-right py-3 px-4 font-medium">ממיר</th>
              <th className="text-right py-3 px-4 font-medium">סטטוס</th>
              <th className="text-right py-3 px-4 font-medium">AC Power</th>
              <th className="text-right py-3 px-4 font-medium">DC Power</th>
              <th className="text-right py-3 px-4 font-medium">יעילות</th>
              <th className="text-right py-3 px-4 font-medium">תפוקה יומית</th>
              <th className="text-right py-3 px-4 font-medium">טמפ׳</th>
            </tr>
          </thead>
          <tbody>
            {inverters.map(inv => {
              const config = statusConfig[inv.status] || statusConfig.online;
              return (
                <tr
                  key={inv.id}
                  className="border-b border-[#30363d]/50 hover:bg-[#242b35] cursor-pointer transition-colors"
                  onClick={() => onSelect(inv)}
                >
                  <td className="py-3 px-4 font-medium text-[#e6edf3]">{inv.name}</td>
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                      {config.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[#e6edf3] tabular-nums">{(inv.current_ac_power_kw || 0).toFixed(2)} kW</td>
                  <td className="py-3 px-4 text-[#e6edf3] tabular-nums">{(inv.current_dc_power_kw || 0).toFixed(2)} kW</td>
                  <td className="py-3 px-4">
                    <span style={{ color: inv.efficiency_percent >= 95 ? "#00ff88" : inv.efficiency_percent >= 90 ? "#ffaa00" : "#ff3333" }}>
                      {(inv.efficiency_percent || 0).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[#e6edf3] tabular-nums">{(inv.daily_yield_kwh || 0).toFixed(1)} kWh</td>
                  <td className="py-3 px-4 text-[#8b949e]">{inv.temperature_c ? `${inv.temperature_c}°C` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {inverters.length === 0 && (
          <div className="text-center py-12 text-[#8b949e] text-sm">
            אין ממירים מוגדרים עבור אתר זה
          </div>
        )}
      </div>
    </div>
  );
}