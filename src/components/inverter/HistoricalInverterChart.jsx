import React, { useState, useMemo } from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

// Generate a color palette for up to 16 strings
const STRING_COLORS = [
  "#f59e0b", "#3b82f6", "#10b981", "#ef4444",
  "#8b5cf6", "#f97316", "#06b6d4", "#ec4899",
  "#84cc16", "#14b8a6", "#a855f7", "#f43f5e",
  "#0ea5e9", "#d97706", "#22c55e", "#6366f1"
];

// Derive how many PV strings exist from the first data point
function detectStrings(firstPoint) {
  if (!firstPoint) return [];
  const strings = [];
  for (let i = 1; i <= 32; i++) {
    if (!Object.prototype.hasOwnProperty.call(firstPoint, `uPv${i}`)) break;
    // Include string if it has any non-zero voltage ever (we check at first point here)
    strings.push(i);
  }
  return strings;
}

// Map raw data point → chart row
function mapPoint(item, stringNums, pacPec) {
  let timeLabel = item.time || '';
  if (item.timeStr) {
    const parts = item.timeStr.split(' ');
    if (parts.length > 1) {
      const tp = parts[1].split(':');
      timeLabel = `${tp[0]}:${tp[1]}`;
    }
  }
  const row = { time: timeLabel, power: parseFloat(((parseFloat(item.pac) || 0) * (pacPec || 0.001)).toFixed(2)) };
  for (const i of stringNums) {
    row[`v${i}`] = parseFloat(item[`uPv${i}`]) || 0;
    row[`a${i}`] = parseFloat(item[`iPv${i}`]) || 0;
  }
  return row;
}

export default function HistoricalInverterChart({ inverterId, inverterSn }) {
  // metric = 'voltage' | 'current' | 'power'
  const [metric, setMetric] = useState('voltage');
  const [selected, setSelected] = useState({}); // key = string index or 'power'
  const [allChecked, setAllChecked] = useState(true);
  const [showAllStrings, setShowAllStrings] = useState(false);
  const hourlyTicks = ['03:00','06:00','09:00','12:00','15:00','18:00','21:00'];

  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['inverterDay', inverterId, inverterSn],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const res = await base44.functions.invoke('getSolisGraphData', {
        endpoint: '/v1/api/inverterDay',
        body: { id: inverterId, sn: inverterSn, time: today, timezone: 2 }
      });
      if (res.data?.success && res.data?.data) return res.data.data;
      return [];
    },
    refetchInterval: 5 * 60 * 1000
  });

  // Detect strings from first data point
  const stringNums = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    const nums = detectStrings(rawData[0]);
    // Filter: only include strings that have non-zero voltage at some point
    return nums.filter(i => rawData.some(p => (parseFloat(p[`uPv${i}`]) || 0) > 0));
  }, [rawData]);

  // Limit visible strings to first 8 by default (toggle to show more)
  const visibleStrings = useMemo(() => (showAllStrings ? stringNums : stringNums.slice(0, 8)), [stringNums, showAllStrings]);

  // Group strings into MPPT pairs: MPPT1 = PV1+PV2, MPPT2 = PV3+PV4, etc.
  const mppts = useMemo(() => {
    const groups = [];
    for (let i = 0; i < visibleStrings.length; i += 2) {
      const members = [visibleStrings[i]];
      if (visibleStrings[i + 1] !== undefined) members.push(visibleStrings[i + 1]);
      groups.push({ mppt: Math.floor(i / 2) + 1, strings: members });
    }
    return groups;
  }, [visibleStrings]);

  // Build chart data
  const chartData = useMemo(() => {
    if (!rawData || rawData.length === 0 || visibleStrings.length === 0) return [];
    const pacPec = parseFloat(rawData[0]?.pacPec) || 0.001;
    const mapped = rawData
      .map(item => mapPoint(item, visibleStrings, pacPec))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    // Ensure time categories include standard ticks like Solis (03:00..21:00)
    const timesSet = new Set(mapped.map(r => r.time));
    hourlyTicks.forEach(t => {
      if (!timesSet.has(t)) mapped.push({ time: t });
    });

    return mapped.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [rawData, visibleStrings, hourlyTicks]);

  // Initialize selection when strings are detected
  const initSelection = useMemo(() => {
    const s = { power: true };
    for (const i of stringNums) s[i] = true;
    return s;
  }, [stringNums]);

  // Use initSelection if selected is empty
  const activeSelection = Object.keys(selected).length > 0 ? selected : initSelection;

  const toggleItem = (key) => {
    const next = { ...activeSelection, [key]: !activeSelection[key] };
    setSelected(next);
    const allOn = Object.values(next).every(Boolean);
    setAllChecked(allOn);
  };

  const toggleAll = () => {
    const newVal = !allChecked;
    const next = {};
    next.power = newVal;
    for (const i of visibleStrings) next[i] = newVal;
    setSelected(next);
    setAllChecked(newVal);
  };

  // Lines to render based on metric
  const lines = useMemo(() => {
    const result = [];
    if (metric === 'power' && activeSelection.power) {
      result.push({ key: 'power', name: 'Total Power (kW)', color: '#f59e0b', yAxis: 'left', unit: 'kW' });
    }
    if (metric === 'voltage') {
      visibleStrings.forEach((i, idx) => {
        if (activeSelection[i]) {
          const mpptIdx = Math.floor(idx / 2);
          const stringInMppt = idx % 2;
          result.push({
            key: `v${i}`,
            name: `PV${i} (MPPT${mpptIdx + 1} Str${stringInMppt + 1})`,
            color: STRING_COLORS[idx % STRING_COLORS.length],
            yAxis: 'left',
            unit: 'V'
          });
        }
      });
    }
    if (metric === 'current') {
      visibleStrings.forEach((i, idx) => {
        if (activeSelection[i]) {
          result.push({
            key: `a${i}`,
            name: `PV${i} (MPPT${Math.floor(idx / 2) + 1} Str${idx % 2 + 1})`,
            color: STRING_COLORS[idx % STRING_COLORS.length],
            yAxis: 'left',
            unit: 'A'
          });
        }
      });
    }
    return result;
  }, [metric, activeSelection, stringNums]);

  const yLabel = metric === 'voltage' ? 'V' : metric === 'current' ? 'A' : 'kW';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-slate-500 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
        <div>מושך נתונים...</div>
      </div>
    );
  }

  if (error || !chartData || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-slate-500 border border-dashed rounded-xl">
        אין נתונים להיום
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Sidebar */}
      <div className="w-full md:w-52 shrink-0 md:border-l border-slate-100 md:pl-4 space-y-4 border-t md:border-t-0 pt-4 md:pt-0">
        {/* Metric selector */}
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">פרמטר</div>
          <div className="space-y-1">
            {[
              { value: 'voltage', label: 'מתח (V)' },
              { value: 'current', label: 'זרם (A)' },
              { value: 'power', label: 'הספק (kW)' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setMetric(opt.value)}
                className={`w-full text-right text-sm px-3 py-1.5 rounded-lg transition-colors ${metric === opt.value ? 'bg-slate-800 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Select All */}
        {metric !== 'power' && (
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">סטרינגים</div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
              <Checkbox id="chk-all" checked={allChecked} onCheckedChange={toggleAll} />
              <Label htmlFor="chk-all" className="text-sm font-bold cursor-pointer text-slate-700">סמן הכל</Label>
            </div>
            {/* Group by MPPT */}
            <div className="space-y-3">
              {mppts.map((group) => (
                <div key={group.mppt}>
                  <div className="text-xs font-bold text-slate-400 mb-1">MPPT {group.mppt}</div>
                  <div className="space-y-1.5 pr-2">
                    {group.strings.map((i, sIdx) => {
                      const colorIdx = (group.mppt - 1) * 2 + sIdx;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <Checkbox
                            id={`chk-${i}`}
                            checked={!!activeSelection[i]}
                            onCheckedChange={() => toggleItem(i)}
                          />
                          <Label
                            htmlFor={`chk-${i}`}
                            className="text-xs cursor-pointer font-medium"
                            style={{ color: STRING_COLORS[colorIdx % STRING_COLORS.length] }}
                          >
                            PV{i} (Str {sIdx + 1})
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {stringNums.length > 8 && (
              <button
                className="mt-3 text-xs font-medium text-green-700 hover:text-green-800"
                onClick={() => setShowAllStrings(v => !v)}
              >
                {showAllStrings ? 'הצג פחות' : `הצג עוד (${stringNums.length - 8} נוספים)`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 h-64 sm:h-80 md:h-[400px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 12 }}
              domain={['auto','auto']}
            />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '12px' }}
              labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
              formatter={(value, name) => [value == null ? '-' : `${value} ${yLabel}`, name]}
            />
            {lines.map(l => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}