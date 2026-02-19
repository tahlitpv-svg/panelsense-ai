import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Settings, Wrench, MapPin, DollarSign, Calendar } from "lucide-react";
import { motion } from "framer-motion";

export default function SiteConfiguration({ site }) {
  const [config, setConfig] = useState({
    name: site.name || '',
    owner: site.owner || 'delkal_energy',
    dc_capacity_kwp: site.dc_capacity_kwp || 0,
    ac_capacity_kw: site.ac_capacity_kw || 0,
    inverter_type: site.inverter_type || '',
    panel_type: site.panel_type || '',
    azimuth_deg: site.azimuth_deg || 0,
    tilt_deg: site.tilt_deg || 0,
    mounting_type: site.mounting_type || 'roof',
    latitude: site.latitude || 0,
    longitude: site.longitude || 0,
    region_tag: site.region_tag || 'center',
    tariff_per_kwh: site.tariff_per_kwh || 0.5,
    initial_investment: site.initial_investment || 0,
    installation_date: site.installation_date || '',
    cleaning_interval_days: site.cleaning_interval_days || 90,
    num_inverters: site.num_inverters || 1
  });

  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Site.update(site.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site'] });
      alert('ההגדרות נשמרו בהצלחה!');
    }
  });

  const handleSave = () => {
    updateMutation.mutate({
      ...config,
      dc_capacity_kwp: parseFloat(config.dc_capacity_kwp),
      ac_capacity_kw: parseFloat(config.ac_capacity_kw),
      azimuth_deg: parseFloat(config.azimuth_deg),
      tilt_deg: parseFloat(config.tilt_deg),
      latitude: parseFloat(config.latitude),
      longitude: parseFloat(config.longitude),
      tariff_per_kwh: parseFloat(config.tariff_per_kwh),
      initial_investment: parseFloat(config.initial_investment),
      cleaning_interval_days: parseInt(config.cleaning_interval_days),
      num_inverters: parseInt(config.num_inverters)
    });
  };

  const sections = [
    {
      title: 'מידע כללי',
      icon: Settings,
      color: '#00ff88',
      fields: [
        { key: 'name', label: 'שם האתר', type: 'text' },
        { key: 'owner', label: 'בעלות', type: 'select', options: [
          { value: 'delkal_energy', label: 'דלקל אנרגיה' },
          { value: 'external_client', label: 'לקוח חיצוני' }
        ]},
        { key: 'installation_date', label: 'תאריך התקנה', type: 'date' }
      ]
    },
    {
      title: 'מפרט טכני',
      icon: Wrench,
      color: '#00ccff',
      fields: [
        { key: 'dc_capacity_kwp', label: 'הספק DC (kWp)', type: 'number' },
        { key: 'ac_capacity_kw', label: 'הספק AC (kW)', type: 'number' },
        { key: 'num_inverters', label: 'מספר ממירים', type: 'number' },
        { key: 'inverter_type', label: 'סוג ממיר', type: 'text' },
        { key: 'panel_type', label: 'סוג פאנל', type: 'text' },
        { key: 'azimuth_deg', label: 'אזימוט (מעלות)', type: 'number' },
        { key: 'tilt_deg', label: 'זווית הטיה (מעלות)', type: 'number' },
        { key: 'mounting_type', label: 'סוג הרכבה', type: 'select', options: [
          { value: 'roof', label: 'גג' },
          { value: 'ground', label: 'קרקע' },
          { value: 'tracker', label: 'עוקב שמש' }
        ]}
      ]
    },
    {
      title: 'מיקום גיאוגרפי',
      icon: MapPin,
      color: '#ffaa00',
      fields: [
        { key: 'latitude', label: 'קו רוחב', type: 'number' },
        { key: 'longitude', label: 'קו אורך', type: 'number' },
        { key: 'region_tag', label: 'אזור', type: 'select', options: [
          { value: 'north', label: 'צפון' },
          { value: 'center', label: 'מרכז' },
          { value: 'south', label: 'דרום' },
          { value: 'arava', label: 'ערבה' }
        ]}
      ]
    },
    {
      title: 'פיננסים ותחזוקה',
      icon: DollarSign,
      color: '#a78bfa',
      fields: [
        { key: 'tariff_per_kwh', label: 'תעריף (₪/kWh)', type: 'number', step: '0.01' },
        { key: 'initial_investment', label: 'השקעה ראשונית (₪)', type: 'number' },
        { key: 'cleaning_interval_days', label: 'מרווח ניקוי (ימים)', type: 'number' }
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: 'linear-gradient(135deg, #00ff8830, #00ff8810)' }}>
            <Settings className="w-6 h-6 text-[#00ff88]" />
          </div>
          הגדרות מערכת
        </h2>
        <Button 
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="gap-2 font-bold"
          style={{ 
            background: 'linear-gradient(135deg, #00ff88, #00cc6f)',
            color: '#000'
          }}
        >
          <Save className="w-4 h-4" />
          {updateMutation.isPending ? 'שומר...' : 'שמור שינויים'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sections.map((section, idx) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="futuristic-card p-6 border-0" style={{ borderTop: `3px solid ${section.color}` }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg" style={{ background: `${section.color}20` }}>
                  <section.icon className="w-5 h-5" style={{ color: section.color }} />
                </div>
                <h3 className="text-lg font-bold text-white">{section.title}</h3>
              </div>
              <div className="space-y-4">
                {section.fields.map(field => (
                  <div key={field.key} className="space-y-2">
                    <Label className="text-gray-400 text-xs uppercase tracking-wide">
                      {field.label}
                    </Label>
                    {field.type === 'select' ? (
                      <Select 
                        value={config[field.key]?.toString()} 
                        onValueChange={(v) => setConfig({...config, [field.key]: v})}
                      >
                        <SelectTrigger className="bg-[#0d1117] border-[#30363d] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={field.type}
                        step={field.step}
                        value={config[field.key]}
                        onChange={(e) => setConfig({...config, [field.key]: e.target.value})}
                        className="bg-[#0d1117] border-[#30363d] text-white focus:border-[#00ff88]"
                      />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}