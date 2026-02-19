import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Loader2, FileText, TrendingUp, DollarSign, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const regionLabels = { north: "צפון", center: "מרכז", south: "דרום", arava: "ערבה" };
const PIE_COLORS = ["#00ff88", "#58a6ff", "#ffaa00", "#ff6b6b", "#a78bfa"];

export default function Reports() {
  const [timeframe, setTimeframe] = useState("daily");

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#00ff88] animate-spin" />
      </div>
    );
  }

  const yieldKey = timeframe === "daily" ? "daily_yield_kwh" : timeframe === "monthly" ? "monthly_yield_kwh" : timeframe === "yearly" ? "yearly_yield_kwh" : "lifetime_yield_kwh";

  const totalYield = sites.reduce((s, site) => s + (site[yieldKey] || 0), 0);
  const totalRevenue = sites.reduce((s, site) => s + ((site[yieldKey] || 0) * (site.tariff_per_kwh || 0.48)), 0);
  const totalInvestment = sites.reduce((s, site) => s + (site.initial_investment || 0), 0);
  const lifetimeRevenue = sites.reduce((s, site) => s + ((site.lifetime_yield_kwh || 0) * (site.tariff_per_kwh || 0.48)), 0);
  const roi = totalInvestment > 0 ? ((lifetimeRevenue / totalInvestment) * 100).toFixed(1) : 0;

  // By site chart
  const siteData = sites.map(s => ({
    name: s.name,
    yield: s[yieldKey] || 0,
    revenue: ((s[yieldKey] || 0) * (s.tariff_per_kwh || 0.48)),
  })).sort((a, b) => b.yield - a.yield);

  // By region pie
  const regionAgg = {};
  sites.forEach(s => {
    const r = s.region_tag || "other";
    if (!regionAgg[r]) regionAgg[r] = 0;
    regionAgg[r] += (s[yieldKey] || 0);
  });
  const regionPie = Object.entries(regionAgg).map(([k, v]) => ({ name: regionLabels[k] || k, value: v }));

  const timeframes = [
    { key: "daily", label: "יומי" },
    { key: "monthly", label: "חודשי" },
    { key: "yearly", label: "שנתי" },
    { key: "lifetime", label: "מצטבר" },
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass-card rounded-lg p-3 text-xs" style={{ border: '1px solid #30363d' }}>
        <p className="font-semibold text-[#e6edf3] mb-1">{d.name}</p>
        <p className="text-[#00ff88]">{d.yield?.toLocaleString()} kWh</p>
        <p className="text-[#58a6ff]">₪{d.revenue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
      </div>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">דוחות ביצועים</h1>
          <p className="text-sm text-[#8b949e] mt-1">ניתוח תפוקה ופיננסי</p>
        </div>
        <div className="flex gap-2">
          {timeframes.map(t => (
            <button
              key={t.key}
              onClick={() => setTimeframe(t.key)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all
                ${timeframe === t.key ? "bg-[#00ff88]/10 text-[#00ff88]" : "text-[#8b949e] hover:bg-[#242b35]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sun className="w-4 h-4 text-[#00ff88]" />
            <span className="text-[10px] text-[#8b949e]">תפוקה כוללת</span>
          </div>
          <p className="text-lg font-bold text-[#e6edf3]">{totalYield.toLocaleString()} kWh</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-[#58a6ff]" />
            <span className="text-[10px] text-[#8b949e]">הכנסה</span>
          </div>
          <p className="text-lg font-bold text-[#e6edf3]">₪{totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-[#ffaa00]" />
            <span className="text-[10px] text-[#8b949e]">ROI מצטבר</span>
          </div>
          <p className="text-lg font-bold text-[#e6edf3]">{roi}%</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-[#a78bfa]" />
            <span className="text-[10px] text-[#8b949e]">אתרים פעילים</span>
          </div>
          <p className="text-lg font-bold text-[#e6edf3]">{sites.filter(s => s.status !== "offline").length} / {sites.length}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">תפוקה לפי אתר</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={siteData} layout="vertical" margin={{ top: 5, right: 30, left: 5, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#8b949e', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#8b949e', fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Bar dataKey="yield" fill="#00ff88" fillOpacity={0.8} radius={[0, 6, 6, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">חלוקה אזורית</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={regionPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {regionPie.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="glass-card rounded-lg p-2 text-xs" style={{ border: '1px solid #30363d' }}>
                        <p className="text-[#e6edf3]">{payload[0].name}: {payload[0].value.toLocaleString()} kWh</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {regionPie.map((r, i) => (
                <span key={r.name} className="flex items-center gap-1 text-[10px] text-[#8b949e]">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}