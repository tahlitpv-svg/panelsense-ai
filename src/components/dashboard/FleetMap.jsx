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
    <div style={{ background: '#161c26', border: '1px solid rgba(255,255,255,0.05)' }} className="overflow-hidden h-full rounded-2xl">
      <div className="h-full w-full min-h-[380px]">
        <MapContainer 
          center={center} 
          zoom={8} 
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {validSites.map((site) => (
            <Marker
              key={site.id}
              position={[site.latitude, site.longitude]}
              icon={createCustomIcon(site.status)}
            >
              <Popup className="custom-popup">
                <div style={{ background: '#1a2235', color: '#e2e8f0', borderRadius: 8, minWidth: 150, padding: '8px 10px', border: '1px solid rgba(74,222,128,0.2)' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 6, color: '#fff', fontSize: 13 }}>{site.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 5, marginTop: 5 }}>
                    <span>הספק:</span>
                    <span style={{ color: '#4ade80', fontWeight: 600 }}>{site.current_power_kw?.toFixed(1)} kW</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                    <span>יומי:</span>
                    <span style={{ color: '#60a5fa', fontWeight: 600 }}>{site.daily_yield_kwh?.toFixed(0)} kWh</span>
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
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-popup-tip {
          background: #1a2235 !important;
        }
      `}</style>
    </div>
  );
}