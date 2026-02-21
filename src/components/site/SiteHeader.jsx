import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { ChevronRight, MapPin, Calendar, Zap } from "lucide-react";
import moment from "moment";
import { Badge } from "@/components/ui/badge";

const statusConfig = {
  online: { color: "#10b981", label: "פעיל", bg: "bg-emerald-500" },
  warning: { color: "#f59e0b", label: "אזהרה", bg: "bg-amber-500" },
  offline: { color: "#ef4444", label: "לא מקוון", bg: "bg-red-500" },
};

const regionLabels = {
  north: "צפון",
  center: "מרכז",
  south: "דרום",
  arava: "ערבה",
};

export default function SiteHeader({ site }) {
  const config = statusConfig[site.status] || statusConfig.online;

  return (
    <div className="bg-white border-b border-slate-200 px-8 py-4 mb-6 -mx-8 -mt-8 sticky top-0 z-30 shadow-sm">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
        <Link to={createPageUrl("Dashboard")} className="hover:text-slate-800 transition-colors">מגדל הבקרה</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slate-800 font-medium">{site.name}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${config.bg} bg-opacity-10`}>
            <Zap className="w-6 h-6" style={{ color: config.color }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{site.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {regionLabels[site.region_tag] || site.region_tag}
              </span>
              <span className="w-px h-3 bg-slate-300"></span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {site.installation_date ? moment(site.installation_date).format("MMM YYYY") : "N/A"}
              </span>
              <span className="w-px h-3 bg-slate-300"></span>
              <Badge className={`border-0 font-normal ${config.bg} bg-opacity-10 text-${config.color === '#10b981' ? 'emerald' : config.color === '#f59e0b' ? 'amber' : 'red'}-600`} style={{ color: config.color }}>
                 {config.label}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-center min-w-[80px]">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">DC</p>
            <p className="text-sm font-bold text-slate-700">{site.dc_capacity_kwp || 0} kWp</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-center min-w-[80px]">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">AC</p>
            <p className="text-sm font-bold text-slate-700">{site.ac_capacity_kw || 0} kW</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-center min-w-[80px]">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">ממירים</p>
            <p className="text-sm font-bold text-slate-700">{site.num_inverters || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}