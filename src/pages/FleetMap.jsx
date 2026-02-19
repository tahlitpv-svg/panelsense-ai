import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { Loader2, ExternalLink } from "lucide-react";
import "leaflet/dist/leaflet.css";

const statusColors = {
  online: "#00ff88",
  warning: "#ffaa00",
  offline: "#ff3333",
};

export default function FleetMap() {
  const { data: sites = [], isLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#00ff88] animate-spin" />
      </div>
    );
  }

  const sitesWithCoords = sites.filter(s => s.latitude && s.longitude);
  const center = sitesWithCoords.length > 0
    ? [sitesWithCoords.reduce((s, site) => s + site.latitude, 0) / sitesWithCoords.length,
       sitesWithCoords.reduce((s, site) => s + site.longitude, 0) / sitesWithCoords.length]
    : [31.5, 34.8];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3]">מפת הצי</h1>
        <p className="text-sm text-[#8b949e] mt-1">מיקום גיאוגרפי של כל המערכות</p>
      </div>

      <div className="glass-card rounded-xl overflow-hidden" style={{ height: "calc(100vh - 200px)" }}>
        <MapContainer center={center} zoom={8} style={{ height: "100%", width: "100%" }}
          className="rounded-xl">
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          {sitesWithCoords.map(site => (
            <CircleMarker
              key={site.id}
              center={[site.latitude, site.longitude]}
              radius={10}
              pathOptions={{
                color: statusColors[site.status] || "#00ff88",
                fillColor: statusColors[site.status] || "#00ff88",
                fillOpacity: 0.6,
                weight: 2
              }}
            >
              <Popup>
                <div className="text-xs" dir="rtl" style={{ minWidth: 160 }}>
                  <p className="font-bold text-sm mb-1">{site.name}</p>
                  <p>הספק: {(site.current_power_kw || 0).toFixed(1)} kW</p>
                  <p>תפוקה יומית: {(site.daily_yield_kwh || 0).toFixed(0)} kWh</p>
                  <p>קיבולת: {site.dc_capacity_kwp || 0} kWp</p>
                  <Link to={createPageUrl(`SiteDetail?id=${site.id}`)} className="text-blue-500 flex items-center gap-1 mt-2 hover:underline">
                    צפה באתר <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}