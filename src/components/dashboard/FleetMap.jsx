import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Card } from "@/components/ui/card";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const createCustomIcon = (status) => {
  const colors = {
    online: '#4ade80',
    warning: '#fbbf24',
    offline: '#f87171'
  };
  
  return L.divIcon({
    html: `<div style="background-color: ${colors[status] || colors.online}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

export default function FleetMap({ sites }) {
  const validSites = sites.filter(site => site.latitude && site.longitude);
  
  const center = validSites.length > 0
    ? [
        validSites.reduce((sum, site) => sum + site.latitude, 0) / validSites.length,
        validSites.reduce((sum, site) => sum + site.longitude, 0) / validSites.length
      ]
    : [31.5, 34.9];

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden h-full rounded-2xl">
      <div className="h-full w-full min-h-[400px]">
        <MapContainer 
          center={center} 
          zoom={8} 
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {validSites.map((site) => (
            <Marker
              key={site.id}
              position={[site.latitude, site.longitude]}
              icon={createCustomIcon(site.status)}
            >
              <Popup className="custom-popup">
                <div className="p-1 min-w-[150px]">
                  <div className="font-bold text-slate-800 mb-1">{site.name}</div>
                  <div className="flex justify-between text-xs text-slate-500 border-t border-slate-100 pt-1 mt-1">
                    <span>הספק:</span>
                    <span className="font-medium text-slate-700">{site.current_power_kw?.toFixed(1)} kW</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>יומי:</span>
                    <span className="font-medium text-slate-700">{site.daily_yield_kwh?.toFixed(0)} kWh</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <style>{`
        .leaflet-popup-content-wrapper {
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          padding: 0;
        }
        .leaflet-popup-content {
          margin: 10px;
        }
      `}</style>
    </Card>
  );
}