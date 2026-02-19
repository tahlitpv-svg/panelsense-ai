import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Card } from "@/components/ui/card";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const createCustomIcon = (status) => {
  const colors = {
    online: '#00ff88',
    warning: '#ffaa00',
    offline: '#ff3333'
  };
  
  return L.divIcon({
    html: `<div style="background-color: ${colors[status] || colors.online}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4);"></div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
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
    <Card className="border-0 shadow-2xl overflow-hidden" 
          style={{ background: '#0d1117' }}>
      <div className="h-[500px] w-full">
        <MapContainer 
          center={center} 
          zoom={8} 
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {validSites.map((site) => (
            <Marker
              key={site.id}
              position={[site.latitude, site.longitude]}
              icon={createCustomIcon(site.status)}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-bold mb-1">{site.name}</div>
                  <div className="text-xs text-gray-600">
                    הספק: {site.current_power_kw?.toFixed(1)} kW
                  </div>
                  <div className="text-xs text-gray-600">
                    יומי: {site.daily_yield_kwh?.toFixed(0)} kWh
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </Card>
  );
}