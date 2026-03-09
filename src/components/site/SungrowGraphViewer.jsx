import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar } from 'recharts';
import { format, parseISO, subDays, addDays } from 'date-fns';

export default function SungrowGraphViewer({ siteId, psId }) {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const formatDateForApi = (date) => {
    return format(date, 'yyyyMMdd');
  };

  // Point IDs from Sungrow V2 API
  const POINT_IDS = {
    power: '1',          // Current power (kW)
    dailyYield: '2',     // Daily yield (kWh)
    voltage: '3',        // Voltage
    temperature: '4',    // Temperature
  };

  // Fetch power data (point_id: 1)
  const { data: powerData, isLoading: isPowerLoading } = useQuery({
    queryKey: ['sungrow-power', psId, selectedDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getSungrowHistoricalData', {
        ps_id: psId,
        query_date: formatDateForApi(selectedDate),
        point_id: POINT_IDS.power
      });
      return response.data?.data || [];
    },
    enabled: !!psId
  });

  // Fetch daily yield data (point_id: 2)
  const { data: yieldData, isLoading: isYieldLoading } = useQuery({
    queryKey: ['sungrow-yield', psId, selectedDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getSungrowHistoricalData', {
        ps_id: psId,
        query_date: formatDateForApi(selectedDate),
        point_id: POINT_IDS.dailyYield
      });
      return response.data?.data || [];
    },
    enabled: !!psId
  });

  // Fetch voltage data (point_id: 3)
  const { data: voltageData, isLoading: isVoltageLoading } = useQuery({
    queryKey: ['sungrow-voltage', psId, selectedDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getSungrowHistoricalData', {
        ps_id: psId,
        query_date: formatDateForApi(selectedDate),
        point_id: POINT_IDS.voltage
      });
      return response.data?.data || [];
    },
    enabled: !!psId
  });

  // Fetch temperature data (point_id: 4)
  const { data: tempData, isLoading: isTempLoading } = useQuery({
    queryKey: ['sungrow-temp', psId, selectedDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getSungrowHistoricalData', {
        ps_id: psId,
        query_date: formatDateForApi(selectedDate),
        point_id: POINT_IDS.temperature
      });
      return response.data?.data || [];
    },
    enabled: !!psId
  });

  const isLoading = isPowerLoading || isYieldLoading || isVoltageLoading || isTempLoading;

  // Merge power and yield data
  const chartData = (powerData || []).map((point, idx) => {
    const yieldPoint = yieldData?.[idx] || {};
    return {
      time: point.time || point.collect_time || `${idx}`,
      power: parseFloat(point.value) || 0,
      yield: parseFloat(yieldPoint.value) || 0,
    };
  });

  // Voltage data
  const voltageChartData = (voltageData || []).map((point, idx) => ({
    time: point.time || point.collect_time || `${idx}`,
    voltage: parseFloat(point.value) || 0,
  }));

  // Temperature data
  const tempChartData = (tempData || []).map((point, idx) => ({
    time: point.time || point.collect_time || `${idx}`,
    temperature: parseFloat(point.value) || 0,
  }));

  const handlePrevDay = () => setSelectedDate(subDays(selectedDate, 1));
  const handleNextDay = () => setSelectedDate(addDays(selectedDate, 1));

  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-slate-200">
        <Button variant="outline" size="icon" onClick={handlePrevDay}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h3 className="text-lg font-bold text-slate-900">
          {format(selectedDate, 'dd MMMM yyyy')}
        </h3>
        <Button
          variant="outline"
          size="icon"
          onClick={handleNextDay}
          disabled={selectedDate >= new Date()}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <Loader className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Power & Yield Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>הספק ויצור יומי</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 12 }}
                      interval={Math.floor(chartData.length / 8)}
                    />
                    <YAxis yAxisId="left" label={{ value: 'הספק (kW)', angle: -90, position: 'insideLeft' }} />
                    <YAxis yAxisId="right" orientation="right" label={{ value: 'ייצור (kWh)', angle: 90, position: 'insideRight' }} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="power" stroke="#16a34a" name="הספק (kW)" dot={false} />
                    <Bar yAxisId="right" dataKey="yield" fill="#06b6d4" name="ייצור מצטבר (kWh)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Voltage Chart */}
          {voltageChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>מתח (DC)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={voltageChartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 12 }}
                      interval={Math.floor(voltageChartData.length / 8)}
                    />
                    <YAxis label={{ value: 'מתח (V)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="voltage" stroke="#f59e0b" name="מתח (V)" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Temperature Chart */}
          {tempChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>טמפרטורה הממיר</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={tempChartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 12 }}
                      interval={Math.floor(tempChartData.length / 8)}
                    />
                    <YAxis label={{ value: 'טמפרטורה (°C)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="temperature" stroke="#ef4444" name="טמפרטורה (°C)" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {chartData.length === 0 && !isLoading && (
            <Card>
              <CardContent className="py-8 text-center text-slate-500">
                אין נתונים זמינים לתאריך זה
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}