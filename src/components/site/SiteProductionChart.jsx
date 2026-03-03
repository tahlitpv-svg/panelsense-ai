import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";

export default function SiteProductionChart({ stationId }) {
  const [timeframe, setTimeframe] = useState('today');

  const { data: chartData, isLoading, error } = useQuery({
    queryKey: ['stationGraph', stationId, timeframe],
    queryFn: async () => {
      if (!stationId) return [];

      const now = new Date();
      let endpoint = '';
      let body = { id: stationId, timezone: 2 };
      let mapData = (item) => item;

      if (timeframe === 'today' || timeframe === 'yesterday') {
        endpoint = '/v1/api/stationDay';
        const targetDate = timeframe === 'today' ? now : subDays(now, 1);
        body.time = format(targetDate, 'yyyy-MM-dd');
        
        mapData = (item) => ({
          label: item.timeStr,
          value: parseFloat(((parseFloat(item.power) || 0) / 1000).toFixed(2)),
          valueLabel: 'kW'
        });
      } else if (timeframe === 'month') {
        endpoint = '/v1/api/stationMonth';
        body.month = format(now, 'yyyy-MM');
        
        mapData = (item) => {
          const dayMatch = item.dateStr.split('-');
          const day = dayMatch.length > 2 ? dayMatch[2] : item.dateStr;
          return {
            label: day,
            value: parseFloat(item.energy) || 0,
            valueLabel: 'kWh'
          };
        };
      } else if (timeframe === 'year') {
        endpoint = '/v1/api/stationYear';
        body.year = format(now, 'yyyy');
        
        mapData = (item) => {
          const monthMatch = item.dateStr.split('-');
          const month = monthMatch.length > 1 ? monthMatch[1] : item.dateStr;
          // energy returned from stationYear is in MWh, but let's check energyStr
          let energy = parseFloat(item.energy) || 0;
          if (item.energyStr === 'MWh') energy = energy * 1000;
          return {
            label: month,
            value: energy,
            valueLabel: 'kWh'
          };
        };
      }

      const res = await base44.functions.invoke('getSolisGraphData', {
        endpoint,
        body
      });

      if (res.data?.success && res.data?.data) {
        return res.data.data.map(mapData);
      }
      return [];
    },
    enabled: !!stationId
  });

  const isDay = timeframe === 'today' || timeframe === 'yesterday';
  const color = isDay ? "#f97316" : "#3b82f6";

  return (
    <Card className="p-6 border border-slate-200 shadow-sm bg-white">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h3 className="text-lg font-bold text-slate-800">
          {timeframe === 'today' && 'ייצור יומי (הספק kW)'}
          {timeframe === 'yesterday' && 'ייצור אתמול (הספק kW)'}
          {timeframe === 'month' && 'ייצור חודשי (תפוקה kWh)'}
          {timeframe === 'year' && 'ייצור שנתי (תפוקה kWh)'}
        </h3>
        
        <Tabs value={timeframe} onValueChange={setTimeframe}>
          <TabsList className="bg-slate-100 p-1">
            <TabsTrigger value="today" className="text-sm px-4">היום</TabsTrigger>
            <TabsTrigger value="yesterday" className="text-sm px-4">אתמול</TabsTrigger>
            <TabsTrigger value="month" className="text-sm px-4">חודש</TabsTrigger>
            <TabsTrigger value="year" className="text-sm px-4">שנה</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="h-72">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            <div>מושך נתונים...</div>
          </div>
        ) : !chartData || chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 border border-dashed rounded-xl">
            אין נתונים לתקופה זו
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {isDay ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  stroke="#e2e8f0"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={30}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  stroke="#e2e8f0"
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'kW', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                  itemStyle={{ color }}
                  formatter={(value) => [`${value} kW`, 'הספק']}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke={color} 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, fill: color, stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="label" 
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
                  label={{ value: 'kWh', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                  cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                  itemStyle={{ color }}
                  formatter={(value) => [`${value?.toLocaleString(undefined, {maximumFractionDigits: 1})} kWh`, 'תפוקה']}
                />
                <Bar 
                  dataKey="value" 
                  fill={color} 
                  radius={[4, 4, 0, 0]}
                  barSize={timeframe === 'month' ? 12 : 32}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}