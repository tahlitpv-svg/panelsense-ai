import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from "recharts";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function FleetProductionChart({ sites, timeframe = 'daily' }) {
  // Generate hourly data for today (simulated based on current power)
  const generateHourlyData = () => {
    return Array.from({ length: 24 }, (_, hour) => {
      let totalPower = 0;
      
      if (hour >= 6 && hour <= 18) {
        const sunIntensity = Math.sin(((hour - 6) / 12) * Math.PI);
        sites.forEach(site => {
          const sitePower = (site.current_power_kw || 0) * sunIntensity * (0.85 + Math.random() * 0.3);
          totalPower += sitePower;
        });
      }
      
      return {
        hour: `${hour.toString().padStart(2, '0')}:00`,
        power: parseFloat(totalPower.toFixed(1)),
        energy: parseFloat((totalPower * 1).toFixed(2))
      };
    });
  };

  // Generate daily data for the month
  const generateDailyData = () => {
    const daysInMonth = 30;
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      let totalYield = 0;
      
      sites.forEach(site => {
        const dailyBase = site.daily_yield_kwh || 0;
        const variation = 0.8 + Math.random() * 0.4;
        totalYield += dailyBase * variation;
      });
      
      return {
        day: `${day}`,
        yield: parseFloat(totalYield.toFixed(1)),
        revenue: parseFloat((totalYield * 0.45).toFixed(2))
      };
    });
  };

  // Generate monthly data for the year
  const generateMonthlyData = () => {
    const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    return months.map((month, i) => {
      let totalYield = 0;
      
      sites.forEach(site => {
        const monthlyBase = (site.monthly_yield_kwh || 0);
        const seasonalFactor = 0.7 + 0.6 * Math.sin(((i - 3) / 12) * 2 * Math.PI);
        totalYield += monthlyBase * seasonalFactor;
      });
      
      return {
        month,
        yield: parseFloat((totalYield / 1000).toFixed(1)),
        revenue: parseFloat((totalYield * 0.45 / 1000).toFixed(2))
      };
    });
  };

  const data = timeframe === 'hourly' ? generateHourlyData() 
    : timeframe === 'daily' ? generateDailyData()
    : generateMonthlyData();

  const dataKey = timeframe === 'hourly' ? 'power' : 'yield';
  const xAxisKey = timeframe === 'hourly' ? 'hour' : timeframe === 'daily' ? 'day' : 'month';
  const yAxisLabel = timeframe === 'hourly' ? 'kW' : timeframe === 'monthly' ? 'MWh' : 'kWh';

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    
    return (
      <div className="rounded-lg p-3 shadow-xl" style={{ background: '#1a2235', border: '1px solid rgba(74,222,128,0.2)' }}>
        <p className="text-slate-300 font-bold mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: '#4ade80' }} />
            <span className="text-slate-400 text-sm">
              {timeframe === 'hourly' ? 'הספק' : 'תפוקה'}: 
            </span>
            <span className="text-orange-500 font-bold text-sm">
              {payload[0].value.toFixed(1)} {yAxisLabel}
            </span>
          </div>
          {timeframe !== 'hourly' && payload[1] && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: '#3b82f6' }} />
              <span className="text-slate-500 text-sm">הכנסות:</span>
              <span className="text-blue-500 font-bold text-sm">
                ₪{payload[1].value.toFixed(0)}K
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="h-full"
    >
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey={xAxisKey}
                tick={{ fill: '#64748b', fontSize: 11 }}
                stroke="#e2e8f0"
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis 
                tick={{ fill: '#64748b', fontSize: 11 }}
                stroke="#e2e8f0"
                axisLine={{ stroke: '#e2e8f0' }}
                label={{ 
                  value: yAxisLabel, 
                  angle: -90, 
                  position: 'insideLeft', 
                  fill: '#94a3b8',
                  fontSize: 12
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              {timeframe !== 'hourly' && (
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="circle"
                  formatter={(value) => (
                    <span style={{ color: '#64748b', fontSize: '12px' }}>
                      {value === 'yield' ? 'תפוקה' : 'הכנסות'}
                    </span>
                  )}
                />
              )}
              <Area 
                type="monotone" 
                dataKey={dataKey}
                stroke="#f97316" 
                strokeWidth={2}
                fill="url(#colorYield)"
                dot={false}
                activeDot={{ r: 6, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
              />
              {timeframe !== 'hourly' && (
                <Area 
                  type="monotone" 
                  dataKey="revenue"
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  fill="url(#colorRevenue)"
                  dot={false}
                  activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
    </motion.div>
  );
}