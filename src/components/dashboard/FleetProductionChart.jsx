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
      <div className="rounded-lg p-3 backdrop-blur-md border" 
           style={{ 
             background: 'rgba(26, 31, 46, 0.95)', 
             borderColor: '#00ff88' 
           }}>
        <p className="text-white font-bold mb-2">{label}</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: '#00ff88' }} />
            <span className="text-gray-300 text-sm">
              {timeframe === 'hourly' ? 'הספק' : 'תפוקה'}: 
            </span>
            <span className="text-[#00ff88] font-bold text-sm">
              {payload[0].value.toFixed(1)} {yAxisLabel}
            </span>
          </div>
          {timeframe !== 'hourly' && payload[1] && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: '#58a6ff' }} />
              <span className="text-gray-300 text-sm">הכנסות:</span>
              <span className="text-[#58a6ff] font-bold text-sm">
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
    >
      <Card className="p-6 border-0 futuristic-card">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <div className="w-1 h-6 rounded-full" style={{ background: '#00ff88' }} />
          {timeframe === 'hourly' ? 'ייצור בזמן אמת - היום' : 
           timeframe === 'daily' ? 'ייצור יומי - החודש' : 
           'ייצור חודשי - השנה'}
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#00ff88" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#58a6ff" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey={xAxisKey}
                tick={{ fill: '#8b949e', fontSize: 11 }}
                stroke="#30363d"
                axisLine={{ stroke: '#30363d' }}
              />
              <YAxis 
                tick={{ fill: '#8b949e', fontSize: 11 }}
                stroke="#30363d"
                axisLine={{ stroke: '#30363d' }}
                label={{ 
                  value: yAxisLabel, 
                  angle: -90, 
                  position: 'insideLeft', 
                  fill: '#8b949e',
                  fontSize: 12
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              {timeframe !== 'hourly' && (
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="circle"
                  formatter={(value) => (
                    <span style={{ color: '#8b949e', fontSize: '12px' }}>
                      {value === 'yield' ? 'תפוקה' : 'הכנסות'}
                    </span>
                  )}
                />
              )}
              <Area 
                type="monotone" 
                dataKey={dataKey}
                stroke="#00ff88" 
                strokeWidth={2}
                fill="url(#colorYield)"
                dot={false}
                activeDot={{ r: 6, fill: '#00ff88', stroke: '#000', strokeWidth: 2 }}
              />
              {timeframe !== 'hourly' && (
                <Area 
                  type="monotone" 
                  dataKey="revenue"
                  stroke="#58a6ff" 
                  strokeWidth={2}
                  fill="url(#colorRevenue)"
                  dot={false}
                  activeDot={{ r: 6, fill: '#58a6ff', stroke: '#000', strokeWidth: 2 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  );
}