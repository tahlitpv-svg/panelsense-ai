import React from 'react';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function MPPTTable({ mpptStrings }) {
  if (!mpptStrings || mpptStrings.length === 0) {
    return (
      <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
        <p className="text-gray-400 text-center">אין נתוני MPPT זמינים</p>
      </Card>
    );
  }

  const avgPower = mpptStrings.reduce((sum, s) => sum + (s.power_kw || 0), 0) / mpptStrings.length;

  return (
    <Card className="border-0 overflow-hidden" style={{ background: '#1a1f2e' }}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-700 hover:bg-transparent">
              <TableHead className="text-gray-300 font-bold">String ID</TableHead>
              <TableHead className="text-gray-300 font-bold text-right">מתח (V)</TableHead>
              <TableHead className="text-gray-300 font-bold text-right">זרם (A)</TableHead>
              <TableHead className="text-gray-300 font-bold text-right">הספק (kW)</TableHead>
              <TableHead className="text-gray-300 font-bold text-right">סטטוס</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mpptStrings.map((string, index) => {
              const deviation = avgPower > 0 ? ((string.power_kw - avgPower) / avgPower) * 100 : 0;
              const isLow = deviation < -15;
              
              return (
                <TableRow 
                  key={index} 
                  className="border-gray-700 hover:bg-white/5"
                  style={isLow ? { backgroundColor: '#ff333315' } : {}}
                >
                  <TableCell className="font-medium text-white">{string.string_id}</TableCell>
                  <TableCell className="text-right">
                    <span className="text-cyan-400 font-mono">{string.voltage_v?.toFixed(1) || 0}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-green-400 font-mono">{string.current_a?.toFixed(2) || 0}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-white font-bold font-mono">{string.power_kw?.toFixed(2) || 0}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {isLow ? (
                      <Badge className="bg-red-500/20 text-red-400 border-0">נמוך</Badge>
                    ) : (
                      <Badge className="bg-green-500/20 text-green-400 border-0">תקין</Badge>
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