import React from "react";
import { Zap, DollarSign, Activity, Sun } from "lucide-react";
import { motion } from "framer-motion";

const KpiCard = ({ icon: Icon, label, value, unit, color, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5 }}
    className="glass-card rounded-xl p-5 relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300"
  >
    <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[#8b949e] text-xs font-medium tracking-wide mb-2">{label}</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl md:text-3xl font-bold text-[#e6edf3] tabular-nums">{value}</span>
          <span className="text-sm text-[#8b949e]">{unit}</span>
        </div>
      </div>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
    </div>
  </motion.div>
);

export default function KpiRibbon({ sites }) {
  const totalDailyYield = sites.reduce((sum, s) => sum + (s.daily_yield_kwh || 0), 0);
  const totalRevenue = sites.reduce((sum, s) => sum + ((s.daily_yield_kwh || 0) * (s.tariff_per_kwh || 0.48)), 0);
  const onlineSites = sites.filter(s => s.status !== "offline").length;
  const healthRatio = sites.length > 0 ? Math.round((onlineSites / sites.length) * 100) : 0;
  const activePower = sites.reduce((sum, s) => sum + (s.current_power_kw || 0), 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard icon={Sun} label="תפוקה יומית" value={totalDailyYield.toLocaleString()} unit="kWh" color="#00ff88" delay={0} />
      <KpiCard icon={DollarSign} label="הכנסה יומית" value={`₪${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} unit="" color="#58a6ff" delay={0.1} />
      <KpiCard icon={Activity} label="בריאות הצי" value={`${healthRatio}%`} unit={`${onlineSites}/${sites.length}`} color={healthRatio > 90 ? "#00ff88" : healthRatio > 70 ? "#ffaa00" : "#ff3333"} delay={0.2} />
      <KpiCard icon={Zap} label="הספק פעיל" value={(activePower / 1000).toFixed(2)} unit="MW" color="#ffaa00" delay={0.3} />
    </div>
  );
}