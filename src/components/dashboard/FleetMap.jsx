import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Card } from "@/components/ui/card";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const createCustomIcon = (status) => {
  const colors = {
    online: '#22c55e',
    warning: '#f59e0b',
    offline: '#ef4444'
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
    <div className="overflow-hidden h-full rounded-2xl bg-slate-50">
      <div className="h-full w-full min-h-[380px]">
        <MapContainer 
          center={[31.4, 34.8]} 
          zoom={8} 
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
          maxBounds={[[29.3, 33.5], [33.5, 36.5]]}
          maxBoundsViscosity={1.0}
          minZoom={7}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {validSites.map((site) => (
            <Marker
              key={site.id}
              position={[site.latitude, site.longitude]}
              icon={createCustomIcon(site.status)}
            >
              <Popup className="custom-popup">
                <div className="bg-white rounded-lg min-w-[150px] p-2 border border-slate-100 shadow-sm">
                  <div className="font-bold mb-1.5 text-slate-900 text-[13px]">{site.name}</div>
                  <div className="flex justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-1.5 mt-1.5">
                    <span>הספק:</span>
                    <span className="text-green-600 font-semibold">{site.current_power_kw?.toFixed(1)} kW</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span>יומי:</span>
                    <span className="text-blue-600 font-semibold">{site.daily_yield_kwh?.toFixed(0)} kWh</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <style>{`
        .leaflet-popup-content-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
          padding: 0 !important;
          border-radius: 8px !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-popup-tip {
          background: white !important;
        }
      `}</style>
    </div>
  );
}