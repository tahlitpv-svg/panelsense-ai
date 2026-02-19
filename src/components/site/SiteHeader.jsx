import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { ChevronRight, MapPin, Calendar, Zap } from "lucide-react";
import moment from "moment";

const statusConfig = {
  online: { color: "#00ff88", label: "פעיל" },
  warning: { color: "#ffaa00", label: "אזהרה" },
  offline: { color: "#ff3333", label: "לא מקוון" },
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
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[#8b949e] mb-4">
        <Link to={createPageUrl("Dashboard")} className="hover:text-[#e6edf3] transition-colors">מגדל הבקרה</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#e6edf3]">{site.name}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${config.color}15` }}>
            <Zap className="w-6 h-6" style={{ color: config.color }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#e6edf3]">{site.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-[#8b949e]">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {regionLabels[site.region_tag] || site.region_tag}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {site.installation_date ? moment(site.installation_date).format("MMM YYYY") : "N/A"}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                {config.label}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="glass-card rounded-lg px-4 py-2 text-center">
            <p className="text-[10px] text-[#8b949e]">DC</p>
            <p className="text-sm font-bold text-[#e6edf3]">{site.dc_capacity_kwp || 0} kWp</p>
          </div>
          <div className="glass-card rounded-lg px-4 py-2 text-center">
            <p className="text-[10px] text-[#8b949e]">AC</p>
            <p className="text-sm font-bold text-[#e6edf3]">{site.ac_capacity_kw || 0} kW</p>
          </div>
          <div className="glass-card rounded-lg px-4 py-2 text-center">
            <p className="text-[10px] text-[#8b949e]">ממירים</p>
            <p className="text-sm font-bold text-[#e6edf3]">{site.num_inverters || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}