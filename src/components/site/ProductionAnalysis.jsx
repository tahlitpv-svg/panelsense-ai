import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from "recharts";
import { TrendingUp, Calendar, Zap, AlertCircle } from "lucide-react";
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
      <div className="bg-white p-4 rounded-lg shadow-lg border border-slate-200 text-sm">
        <p className="font-bold text-slate-800 mb-2">{d.fullDate}</p>
        <p className="text-slate-500">תפוקה: <span className="text-orange-500 font-bold">{d.yield} kWh</span></p>
        <p className="text-slate-500">צפי: <span className="text-blue-400 font-bold">{d.predicted} kWh</span></p>
        <p className="text-slate-500">יעילות: <span className="text-amber-500 font-bold">{d.efficiency}%</span></p>
        <p className="text-slate-500">הכנסות: <span className="text-emerald-500 font-bold">₪{d.revenue}</span></p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-orange-50">
            <TrendingUp className="w-5 h-5 text-orange-500" />
          </div>
          ניתוח ייצור היסטורי
        </h2>
        <Tabs value={timeframe} onValueChange={setTimeframe}>
          <TabsList className="bg-slate-100 h-9 p-1 border border-slate-200">
            <TabsTrigger value="week" className="data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs h-7">
              שבוע
            </TabsTrigger>
            <TabsTrigger value="month" className="data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs h-7">
              חודש
            </TabsTrigger>
            <TabsTrigger value="year" className="data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs h-7">
              שנה
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'ממוצע יומי', value: `${avgYield.toFixed(0)} kWh`, icon: Zap, color: '#f97316', bg: 'bg-orange-50' },
          { label: 'סה"כ תפוקה', value: `${(totalYield / 1000).toFixed(1)} MWh`, icon: TrendingUp, color: '#3b82f6', bg: 'bg-blue-50' },
          { label: 'סה"כ הכנסות', value: `₪${totalRevenue.toFixed(0)}`, icon: Calendar, color: '#10b981', bg: 'bg-emerald-50' },
          { label: 'יעילות ממוצעת', value: `${avgEfficiency.toFixed(1)}%`, icon: Zap, color: '#8b5cf6', bg: 'bg-violet-50' }
        ].map((stat, i) => (
          <Card key={i} className="p-4 border border-slate-200 shadow-sm bg-white hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">{stat.label}</span>
            </div>
            <div className="text-2xl font-bold text-slate-800">{stat.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-6 border border-slate-200 shadow-sm bg-white">
        <h3 className="text-slate-800 font-bold mb-6 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          גרף ייצור מול צפי
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#64748b', fontSize: 11 }}
                stroke="#e2e8f0"
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: '#64748b', fontSize: 11 }}
                stroke="#e2e8f0"
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="predicted" 
                stroke="#3b82f6" 
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPredicted)"
                strokeDasharray="5 5"
                activeDot={false}
              />
              <Area 
                type="monotone" 
                dataKey="yield" 
                stroke="#f97316" 
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorYield)"
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-6 mt-4 text-xs justify-center border-t border-slate-50 pt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-slate-600 font-medium">ייצור בפועל</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-400 border-t border-dashed border-blue-400" />
            <span className="text-slate-600 font-medium">ייצור צפוי</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 border border-slate-200 shadow-sm bg-white">
            <h3 className="text-slate-800 font-bold mb-6 flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              יעילות מערכת
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    stroke="#e2e8f0"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    stroke="#e2e8f0"
                    axisLine={false}
                    tickLine={false}
                    domain={[60, 100]}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{fill: '#f8fafc'}} />
                  <Bar 
                    dataKey="efficiency" 
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          
          <Card className="p-6 border border-slate-200 shadow-sm bg-white flex flex-col justify-center items-center text-center">
             <div className="p-4 bg-emerald-50 rounded-full mb-4">
                <TrendingUp className="w-8 h-8 text-emerald-600" />
             </div>
             <h3 className="text-lg font-bold text-slate-800 mb-2">סיכום ביצועים</h3>
             <p className="text-slate-500 text-sm max-w-xs mb-6">
                המערכת פועלת ביעילות גבוהה של <span className="text-slate-900 font-bold">{avgEfficiency.toFixed(1)}%</span> בממוצע לתקופה זו.
                נרשמה עלייה של <span className="text-emerald-600 font-bold">5.2%</span> ביחס לתקופה המקבילה אשתקד.
             </p>
             <Button variant="outline" className="text-slate-600 border-slate-200 hover:bg-slate-50">
                צפה בדוח מלא
             </Button>
          </Card>
      </div>
    </div>
  );
}