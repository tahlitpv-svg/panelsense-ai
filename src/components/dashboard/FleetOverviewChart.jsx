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

  const colors = ["#16a34a", "#3b82f6", "#f59e0b", "#ef4444"];

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg p-3 shadow-lg bg-white border border-slate-200 text-xs">
        <p className="font-bold text-slate-900 mb-1">{d.region}</p>
        <p className="text-slate-500">{d.count} אתרים</p>
        <p className="text-green-600 font-medium">{d.yield.toLocaleString()} kWh סה"כ</p>
        <p className="text-blue-600">{d.avgSpecific} kWh/kWp</p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="h-48"
    >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis dataKey="region" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            <Bar dataKey="yield" radius={[4, 4, 0, 0]} maxBarSize={50}>
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
    </motion.div>
  );
}