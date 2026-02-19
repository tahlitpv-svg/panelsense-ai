import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { motion } from "framer-motion";

const regionLabels = {
  north: "צפון",
  center: "מרכז",
  south: "דרום",
  arava: "ערבה",
};

export default function FleetOverviewChart({ sites }) {
  const regionData = {};
  sites.forEach(site => {
    const tag = site.region_tag || "other";
    if (!regionData[tag]) {
      regionData[tag] = { region: regionLabels[tag] || tag, yield: 0, count: 0, capacity: 0 };
    }
    regionData[tag].yield += (site.daily_yield_kwh || 0);
    regionData[tag].count += 1;
    regionData[tag].capacity += (site.dc_capacity_kwp || 0);
  });

  const data = Object.values(regionData).map(r => ({
    ...r,
    avgSpecific: r.capacity > 0 ? parseFloat((r.yield / r.capacity).toFixed(2)) : 0,
  }));

  const colors = ["#00ff88", "#58a6ff", "#ffaa00", "#ff6b6b"];

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass-card rounded-lg p-3 text-xs" style={{ border: '1px solid #30363d' }}>
        <p className="font-semibold text-[#e6edf3] mb-1">{d.region}</p>
        <p className="text-[#8b949e]">{d.count} אתרים</p>
        <p className="text-[#00ff88]">{d.yield.toLocaleString()} kWh סה"כ</p>
        <p className="text-[#58a6ff]">{d.avgSpecific} kWh/kWp</p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="glass-card rounded-xl p-5"
    >
      <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">תפוקה לפי אזור</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis dataKey="region" tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#8b949e', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar dataKey="yield" radius={[6, 6, 0, 0]} maxBarSize={50}>
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}