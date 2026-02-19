import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";

export default function MpptAnalysis({ inverter }) {
  if (!inverter || !inverter.mppt_strings || inverter.mppt_strings.length === 0) {
    return (
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">ניתוח MPPT</h3>
        <div className="text-center py-8 text-[#8b949e] text-sm">
          בחר ממיר כדי לצפות בנתוני ה-MPPT
        </div>
      </div>
    );
  }

  const data = inverter.mppt_strings.map(s => ({
    name: s.string_id,
    voltage: s.voltage_v || 0,
    current: s.current_a || 0,
    power: s.power_kw || 0,
  }));

  const avgVoltage = data.reduce((s, d) => s + d.voltage, 0) / data.length;
  const avgCurrent = data.reduce((s, d) => s + d.current, 0) / data.length;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass-card rounded-lg p-3 text-xs" style={{ border: '1px solid #30363d' }}>
        <p className="font-semibold text-[#e6edf3] mb-1">{d.name}</p>
        <p className="text-[#00ff88]">מתח: {d.voltage}V</p>
        <p className="text-[#58a6ff]">זרם: {d.current}A</p>
        <p className="text-[#ffaa00]">הספק: {d.power}kW</p>
      </div>
    );
  };

  const efficiencyPercent = inverter.current_dc_power_kw > 0
    ? ((inverter.current_ac_power_kw / inverter.current_dc_power_kw) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-4">
      {/* MPPT Chart */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#e6edf3]">ניתוח MPPT - {inverter.name}</h3>
          <div className="flex gap-3 text-[10px] text-[#8b949e]">
            <span>ממוצע מתח: <span className="text-[#00ff88]">{avgVoltage.toFixed(1)}V</span></span>
            <span>ממוצע זרם: <span className="text-[#58a6ff]">{avgCurrent.toFixed(1)}A</span></span>
          </div>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis dataKey="name" tick={{ fill: '#8b949e', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="v" tick={{ fill: '#8b949e', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="a" orientation="left" tick={{ fill: '#8b949e', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Bar yAxisId="v" dataKey="voltage" fill="#00ff88" fillOpacity={0.7} radius={[4, 4, 0, 0]} maxBarSize={30} name="מתח (V)" />
              <Bar yAxisId="a" dataKey="current" fill="#58a6ff" fillOpacity={0.7} radius={[4, 4, 0, 0]} maxBarSize={30} name="זרם (A)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MPPT Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#8b949e] border-b border-[#30363d]">
              <th className="text-right py-3 px-4 font-medium">String ID</th>
              <th className="text-right py-3 px-4 font-medium">מתח (V)</th>
              <th className="text-right py-3 px-4 font-medium">זרם (A)</th>
              <th className="text-right py-3 px-4 font-medium">הספק (kW)</th>
              <th className="text-right py-3 px-4 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => {
              const voltDev = Math.abs((d.voltage - avgVoltage) / avgVoltage) * 100;
              const isMismatch = voltDev > 10;
              return (
                <tr key={d.name} className="border-b border-[#30363d]/50">
                  <td className="py-3 px-4 font-medium text-[#e6edf3]">{d.name}</td>
                  <td className="py-3 px-4 tabular-nums" style={{ color: isMismatch ? "#ff3333" : "#e6edf3" }}>{d.voltage.toFixed(1)}</td>
                  <td className="py-3 px-4 tabular-nums text-[#e6edf3]">{d.current.toFixed(2)}</td>
                  <td className="py-3 px-4 tabular-nums text-[#e6edf3]">{d.power.toFixed(3)}</td>
                  <td className="py-3 px-4">
                    {isMismatch ? (
                      <span className="text-[#ff3333]">חריגה ({voltDev.toFixed(0)}%)</span>
                    ) : (
                      <span className="text-[#00ff88]">תקין</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Efficiency Gauge */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#e6edf3] mb-3">יעילות המרה AC/DC</h3>
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="#30363d" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke={efficiencyPercent >= 95 ? "#00ff88" : efficiencyPercent >= 90 ? "#ffaa00" : "#ff3333"}
                strokeWidth="3"
                strokeDasharray={`${efficiencyPercent * 0.942} 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[#e6edf3]">{efficiencyPercent}%</span>
          </div>
          <div className="text-xs text-[#8b949e] space-y-1">
            <p>DC Input: <span className="text-[#e6edf3]">{(inverter.current_dc_power_kw || 0).toFixed(2)} kW</span></p>
            <p>AC Output: <span className="text-[#e6edf3]">{(inverter.current_ac_power_kw || 0).toFixed(2)} kW</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}