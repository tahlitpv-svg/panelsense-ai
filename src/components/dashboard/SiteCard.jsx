import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { MapPin, Zap, AlertTriangle, WifiOff, Sun, Activity, Droplets } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const statusConfig = {
  online: { 
    color: '#10b981', // Emerald 500
    bg: '#ecfdf5',    // Emerald 50
    icon: Zap, 
    label: 'מקוון',
    borderColor: '#d1fae5'
  },
  warning: { 
    color: '#f59e0b', // Amber 500
    bg: '#fffbeb',    // Amber 50
    icon: AlertTriangle, 
    label: 'אזהרה',
    borderColor: '#fef3c7'
  },
  offline: { 
    color: '#ef4444', // Red 500
    bg: '#fef2f2',    // Red 50
    icon: WifiOff, 
    label: 'לא מקוון',
    borderColor: '#fee2e2'
  }
};

export default function SiteCard({ site, regionalAverage }) {
  const config = statusConfig[site.status] || statusConfig.online;
  const StatusIcon = config.icon;
  const performance = site.dc_capacity_kwp > 0 
    ? ((site.specific_yield_kwh_kwp / regionalAverage) * 100).toFixed(0) 
    : 100;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Link to={createPageUrl(`SiteDetails?id=${site.id}`)}>
        <Card className="bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden group h-full flex flex-col">
          {/* Header Image / Gradient Placeholder - Like the App Screenshot */}
          <div className="h-24 bg-slate-100 relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-r from-slate-200 to-slate-100" />
             <div className="absolute top-2 right-2">
                <Badge className="bg-white/90 text-slate-700 shadow-sm hover:bg-white backdrop-blur-sm border-0 font-normal gap-1">
                   <Sun className="w-3 h-3 text-orange-400" /> {site.region_tag}
                </Badge>
             </div>
             
             {/* Status Dot */}
             <div className="absolute top-2 left-2 flex gap-2">
                {site.cleaning_recommended && (
                   <div className="bg-blue-100 p-1.5 rounded-full shadow-sm" title="דורש ניקוי">
                      <Droplets className="w-3 h-3 text-blue-500" />
                   </div>
                )}
                <div className="flex items-center gap-1.5 bg-white/90 px-2 py-1 rounded-full shadow-sm">
                   <div className={`w-2 h-2 rounded-full ${site.status === 'online' ? 'bg-emerald-500' : site.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} />
                   <span className="text-[10px] font-medium text-slate-600">{config.label}</span>
                </div>
             </div>
             
             {/* Solar Pattern Overlay */}
             <div className="absolute bottom-0 left-0 right-0 h-full opacity-10" 
                  style={{ backgroundImage: 'radial-gradient(circle at 50% 120%, #000 0%, transparent 50%)' }} />
          </div>

          <div className="p-5 flex-1 flex flex-col">
            <div className="flex justify-between items-start mb-4">
               <div>
                  <h3 className="text-lg font-bold text-slate-800 group-hover:text-orange-600 transition-colors">
                    {site.name}
                  </h3>
                  <div className="flex items-center gap-1 text-slate-400 text-xs mt-1">
                    <MapPin className="w-3 h-3" />
                    <span>{site.region_tag === 'north' ? 'צפון' : site.region_tag === 'center' ? 'מרכז' : site.region_tag === 'south' ? 'דרום' : 'ערבה'}</span>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-3 gap-2 py-4 border-t border-slate-50 mt-auto">
               <div className="text-center">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">תפוקה יומית</div>
                  <div className="font-bold text-slate-700">{site.daily_yield_kwh?.toFixed(0) || 0}</div>
                  <div className="text-[10px] text-slate-400">kWh</div>
               </div>
               <div className="text-center border-r border-l border-slate-50">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">הספק רגעי</div>
                  <div className="font-bold text-slate-700">{site.current_power_kw?.toFixed(1) || 0}</div>
                  <div className="text-[10px] text-slate-400">kW</div>
               </div>
               <div className="text-center">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">קיבולת</div>
                  <div className="font-bold text-slate-700">{site.dc_capacity_kwp}</div>
                  <div className="text-[10px] text-slate-400">kWp</div>
               </div>
            </div>

            {site.status === 'warning' && (
              <div className="mt-3 text-xs bg-amber-50 text-amber-700 px-3 py-2 rounded-lg flex items-center gap-2">
                 <Activity className="w-3 h-3" />
                 <span>ביצועים נמוכים מהצפוי</span>
              </div>
            )}
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}