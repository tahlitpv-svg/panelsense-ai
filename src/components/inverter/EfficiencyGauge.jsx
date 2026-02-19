import React from 'react';
import { Card } from "@/components/ui/card";

export default function EfficiencyGauge({ efficiency }) {
  const percentage = Math.min(100, Math.max(0, efficiency || 0));
  const color = percentage >= 95 ? '#00ff88' : percentage >= 90 ? '#ffaa00' : '#ff3333';
  const rotation = (percentage / 100) * 180 - 90;

  return (
    <Card className="p-6 border-0" style={{ background: '#1a1f2e' }}>
      <div className="text-center">
        <h3 className="text-gray-300 font-bold mb-6">יעילות המרה AC/DC</h3>
        <div className="relative w-48 h-24 mx-auto mb-4">
          <svg viewBox="0 0 200 100" className="w-full h-full">
            <path
              d="M 20 90 A 80 80 0 0 1 180 90"
              fill="none"
              stroke="#2d3748"
              strokeWidth="20"
              strokeLinecap="round"
            />
            <path
              d="M 20 90 A 80 80 0 0 1 180 90"
              fill="none"
              stroke={color}
              strokeWidth="20"
              strokeLinecap="round"
              strokeDasharray={`${(percentage / 100) * 251.2} 251.2`}
              style={{ transition: 'all 0.5s ease' }}
            />
            <circle cx="100" cy="90" r="4" fill={color} />
            <line
              x1="100"
              y1="90"
              x2="100"
              y2="30"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              transform={`rotate(${rotation} 100 90)`}
              style={{ transition: 'transform 0.5s ease' }}
            />
          </svg>
        </div>
        <div className="text-5xl font-bold mb-2" style={{ color }}>
          {percentage.toFixed(1)}%
        </div>
        <div className="text-sm text-gray-400">
          {percentage >= 95 ? 'מצוין' : percentage >= 90 ? 'תקין' : 'דורש בדיקה'}
        </div>
      </div>
    </Card>
  );
}