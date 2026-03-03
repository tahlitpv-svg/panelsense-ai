import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

const COLORS = {
  power: "#f59e0b", // Orange
  v1: "#64748b",    // Slate
  v2: "#f87171",    // Red
  c1: "#4ade80",    // Green
  c2: "#fca5a5"     // Light red
};

export default function HistoricalInverterChart({ inverterId, inverterSn }) {
  const [activeLines, setActiveLines] = useState({
    power: true,
    v1: true,
    v2: true,
    c1: true,
    c2: true
  });

  const toggleLine = (key) => {
    setActiveLines(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const { data: chartData, isLoading, error } = useQuery({
    queryKey: ['inverterDay', inverterId, inverterSn],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await base44.functions.invoke('getSolisGraphData', {
        endpoint: '/v1/api/inverterDay',
        body: { id: inverterId, sn: inverterSn, time: today, timezone: 2 }
      });
      if (res.data?.success && res.data?.data) {
        // Map the array
        return res.data.data.map(item => {
          // extract HH:mm from timeStr like "2026-03-03 05:59:19"
          let timeLabel = item.time;
          if (item.timeStr) {
             const parts = item.timeStr.split(' ');
             if (parts.length > 1) {
                const timeParts = parts[1].split(':');
                timeLabel = `${timeParts[0]}:${timeParts[1]}`;
             }
          }
          return {
            time: timeLabel,
            power: parseFloat(item.pac) || 0,
            v1: parseFloat(item.uPv1) || 0,
            v2: parseFloat(item.uPv2) || 0,
            c1: parseFloat(item.iPv1) || 0,
            c2: parseFloat(item.iPv2) || 0
          };
        }).sort((a, b) => a.time.localeCompare(b.time));
      }
      return [];
    },
    refetchInterval: 5 * 60 * 1000 // refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-slate-500 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
        <div>מושך נתונים היסטוריים...</div>
      </div>
    );
  }

  if (error || !chartData || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-slate-500 border border-dashed rounded-xl">
        אין נתונים היסטוריים להיום
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Sidebar Controls */}
      <div className="lg:col-span-1 border-l border-slate-100 pl-4">
        <h4 className="font-bold text-slate-800 mb-4 text-sm">פרמטרים לבחירה</h4>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox id="chk-power" checked={activeLines.power} onCheckedChange={() => toggleLine('power')} />
            <Label htmlFor="chk-power" className="text-sm cursor-pointer" style={{ color: COLORS.power }}>Total Power (kW)</Label>
          </div>
          <div className="border-t border-slate-100 my-2 pt-2"></div>
          <div className="flex items-center gap-2">
            <Checkbox id="chk-v1" checked={activeLines.v1} onCheckedChange={() => toggleLine('v1')} />
            <Label htmlFor="chk-v1" className="text-sm cursor-pointer" style={{ color: COLORS.v1 }}>DC Voltage MPPT1 (V)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="chk-v2" checked={activeLines.v2} onCheckedChange={() => toggleLine('v2')} />
            <Label htmlFor="chk-v2" className="text-sm cursor-pointer" style={{ color: COLORS.v2 }}>DC Voltage MPPT2 (V)</Label>
          </div>
          <div className="border-t border-slate-100 my-2 pt-2"></div>
          <div className="flex items-center gap-2">
            <Checkbox id="chk-c1" checked={activeLines.c1} onCheckedChange={() => toggleLine('c1')} />
            <Label htmlFor="chk-c1" className="text-sm cursor-pointer" style={{ color: COLORS.c1 }}>DC Current MPPT1 (A)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="chk-c2" checked={activeLines.c2} onCheckedChange={() => toggleLine('c2')} />
            <Label htmlFor="chk-c2" className="text-sm cursor-pointer" style={{ color: COLORS.c2 }}>DC Current MPPT2 (A)</Label>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="lg:col-span-4 h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 11, fill: '#64748b' }} 
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              minTickGap={30}
            />

            {/* Left Y-Axis for Voltage and Power */}
            <YAxis 
              yAxisId="left" 
              orientation="left" 
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              label={{ value: 'V / kW', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
            />

            {/* Right Y-Axis for Current */}
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              label={{ value: 'A', angle: 90, position: 'insideRight', fill: '#64748b', fontSize: 12 }}
            />

            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
              labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}
            />

            {activeLines.power && (
              <Line yAxisId="left" type="monotone" dataKey="power" name="Total Power" stroke={COLORS.power} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            )}
            {activeLines.v1 && (
              <Line yAxisId="left" type="monotone" dataKey="v1" name="DC Voltage MPPT1" stroke={COLORS.v1} strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
            )}
            {activeLines.v2 && (
              <Line yAxisId="left" type="monotone" dataKey="v2" name="DC Voltage MPPT2" stroke={COLORS.v2} strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
            )}
            {activeLines.c1 && (
              <Line yAxisId="right" type="monotone" dataKey="c1" name="DC Current MPPT1" stroke={COLORS.c1} strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
            )}
            {activeLines.c2 && (
              <Line yAxisId="right" type="monotone" dataKey="c2" name="DC Current MPPT2" stroke={COLORS.c2} strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}