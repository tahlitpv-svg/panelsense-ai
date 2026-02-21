import React from 'react';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function MPPTTable({ mpptStrings }) {
  if (!mpptStrings || mpptStrings.length === 0) {
    return (
      <Card className="p-6 border border-slate-200 shadow-sm bg-white text-center py-8">
        <p className="text-slate-400">אין נתוני MPPT זמינים</p>
      </Card>
    );
  }

  const avgPower = mpptStrings.reduce((sum, s) => sum + (s.power_kw || 0), 0) / mpptStrings.length;

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow className="hover:bg-transparent border-slate-100">
              <TableHead className="text-slate-600 font-bold h-10">String ID</TableHead>
              <TableHead className="text-slate-600 font-bold text-right h-10">מתח (V)</TableHead>
              <TableHead className="text-slate-600 font-bold text-right h-10">זרם (A)</TableHead>
              <TableHead className="text-slate-600 font-bold text-right h-10">הספק (kW)</TableHead>
              <TableHead className="text-slate-600 font-bold text-right h-10">סטטוס</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mpptStrings.map((string, index) => {
              const deviation = avgPower > 0 ? ((string.power_kw - avgPower) / avgPower) * 100 : 0;
              const isLow = deviation < -15;
              
              return (
                <TableRow 
                  key={index} 
                  className={`border-slate-50 hover:bg-slate-50 ${isLow ? 'bg-red-50 hover:bg-red-50' : ''}`}
                >
                  <TableCell className="font-medium text-slate-700">{string.string_id}</TableCell>
                  <TableCell className="text-right">
                    <span className="text-orange-600 font-mono text-sm">{string.voltage_v?.toFixed(1) || 0}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-blue-600 font-mono text-sm">{string.current_a?.toFixed(2) || 0}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-slate-800 font-bold font-mono text-sm">{string.power_kw?.toFixed(2) || 0}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {isLow ? (
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-200 border-0 shadow-none font-normal">נמוך</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-0 shadow-none font-normal">תקין</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}