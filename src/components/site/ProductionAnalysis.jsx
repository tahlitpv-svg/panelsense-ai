import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from "recharts";
import { TrendingUp, Calendar, Zap } from "lucide-react";
import moment from "moment";

export default function ProductionAnalysis({ site }) {
  const [timeframe, setTimeframe] = useState('week');

  // Generate historical data
  const generateHistoricalData = () => {
    const days = timeframe === 'week' ? 7 : timeframe === 'month' ? 30 : 365;
    return Array.from({ length: days }, (_, i) => {
      const date = moment().subtract(days - i - 1, 'days');
      const baseYield = site.daily_yield_kwh || 2000;
      const seasonal = Math.sin((date.dayOfYear() / 365) * Math.PI * 2) * 0.3 + 0.7;
      const weather = 0.7 + Math.random() * 0.3;
      const yield_value = baseYield * seasonal * weather;
      
      return {
        date: timeframe === 'year' ? date.format('MMM') : date.format('DD/MM'),
        fullDate: date.format('DD/MM/YYYY'),
        yield: parseFloat(yield_value.toFixed(0)),
        predicted: parseFloat((baseYield * seasonal).toFixed(0)),
        efficiency: parseFloat((85 + Math.random() * 13).toFixed(1)),
        revenue: parseFloat((yield_value * (site.tariff_per_kwh || 0.5)).toFixed(0))
      };
    });
  };

  const data = generateHistoricalData();
  const avgYield = data.reduce((sum, d) => sum + d.yield, 0) / data.length;
  const totalYield = data.reduce((sum, d) => sum + d.yield, 0);
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const avgEfficiency = data.reduce((sum, d) => sum + d.efficiency, 0) / data.length;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="futuristic-card p-4 rounded-lg" style={{ border: '1px solid #00ff8840' }}>
        <p className="text-white font-bold mb-2">{d.fullDate}</p>
        <p className="text-sm text-gray-300">תפוקה: <span className="text-[#00ff88] font-bold">{d.yield} kWh</span></p>
        <p className="text-sm text-gray-300">צפי: <span className="text-[#00ccff] font-bold">{d.predicted} kWh</span></p>
        <p className="text-sm text-gray-300">יעילות: <span className="text-[#ffaa00] font-bold">{d.efficiency}%</span></p>
        <p className="text-sm text-gray-300">הכנסות: <span className="text-[#00ff88] font-bold">₪{d.revenue}</span></p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #00ff8830, #00ff8810)' }}>
            <TrendingUp className="w-6 h-6 text-[#00ff88]" />
          </div>
          ניתוח ייצור היסטורי
        </h2>
        <Tabs value={timeframe} onValueChange={setTimeframe}>
          <TabsList className="bg-[#1a1f2e] border border-[#00ff8840]">
            <TabsTrigger value="week" className="data-[state=active]:bg-[#00ff8820] data-[state=active]:text-[#00ff88]">
              שבוע
            </TabsTrigger>
            <TabsTrigger value="month" className="data-[state=active]:bg-[#00ff8820] data-[state=active]:text-[#00ff88]">
              חודש
            </TabsTrigger>
            <TabsTrigger value="year" className="data-[state=active]:bg-[#00ff8820] data-[state=active]:text-[#00ff88]">
              שנה
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'ממוצע יומי', value: `${avgYield.toFixed(0)} kWh`, icon: Zap, color: '#00ff88' },
          { label: 'סה"כ תפוקה', value: `${(totalYield / 1000).toFixed(1)} MWh`, icon: TrendingUp, color: '#00ccff' },
          { label: 'סה"כ הכנסות', value: `₪${totalRevenue.toFixed(0)}`, icon: Calendar, color: '#ffaa00' },
          { label: 'יעילות ממוצעת', value: `${avgEfficiency.toFixed(1)}%`, icon: Zap, color: '#a78bfa' }
        ].map((stat, i) => (
          <Card key={i} className="futuristic-card p-4 border-0" style={{ borderLeft: `3px solid ${stat.color}` }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg" style={{ background: `${stat.color}20` }}>
                <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">{stat.label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{stat.value}</div>
          </Card>
        ))}
      </div>

      <Card className="futuristic-card p-6 border-0">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00ff88]" />
          גרף ייצור מול צפי
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#00ff88" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00ccff" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#00ccff" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#8b949e', fontSize: 11 }}
                stroke="#30363d"
              />
              <YAxis 
                tick={{ fill: '#8b949e', fontSize: 11 }}
                stroke="#30363d"
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="predicted" 
                stroke="#00ccff" 
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPredicted)"
                strokeDasharray="5 5"
              />
              <Area 
                type="monotone" 
                dataKey="yield" 
                stroke="#00ff88" 
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorYield)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[#00ff88]" />
            <span className="text-gray-400">ייצור בפועל</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-[#00ccff]" style={{ borderTop: '2px dashed #00ccff' }} />
            <span className="text-gray-400">ייצור צפוי</span>
          </div>
        </div>
      </Card>

      <Card className="futuristic-card p-6 border-0">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#ffaa00]" />
          יעילות מערכת
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#8b949e', fontSize: 11 }}
                stroke="#30363d"
              />
              <YAxis 
                tick={{ fill: '#8b949e', fontSize: 11 }}
                stroke="#30363d"
                domain={[70, 100]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="efficiency" 
                fill="#ffaa00"
                radius={[8, 8, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}