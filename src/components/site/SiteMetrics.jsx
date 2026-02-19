import React from "react";
import { Sun, TrendingUp, DollarSign, Gauge } from "lucide-react";

export default function SiteMetrics({ site }) {
  const revenue = (site.daily_yield_kwh || 0) * (site.tariff_per_kwh || 0.48);
  const monthlyRevenue = (site.monthly_yield_kwh || 0) * (site.tariff_per_kwh || 0.48);
  const specificYield = site.dc_capacity_kwp > 0 ? ((site.daily_yield_kwh || 0) / site.dc_capacity_kwp).toFixed(2) : 0;

  const cards = [
    { label: "תפוקה יומית", value: `${(site.daily_yield_kwh || 0).toLocaleString()} kWh`, icon: Sun, color: "#00ff88" },
    { label: "תפוקה סגולית", value: `${specificYield} kWh/kWp`, icon: TrendingUp, color: "#58a6ff" },
    { label: "הכנסה יומית", value: `₪${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: DollarSign, color: "#ffaa00" },
    { label: "יעילות", value: `${site.current_efficiency || 0}%`, icon: Gauge, color: site.current_efficiency >= 90 ? "#00ff88" : site.current_efficiency >= 75 ? "#ffaa00" : "#ff3333" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <c.icon className="w-4 h-4" style={{ color: c.color }} />
            <span className="text-[10px] text-[#8b949e]">{c.label}</span>
          </div>
          <p className="text-lg font-bold text-[#e6edf3]">{c.value}</p>
        </div>
      ))}
    </div>
  );
}