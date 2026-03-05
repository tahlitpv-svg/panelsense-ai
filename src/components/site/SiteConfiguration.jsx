import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Settings, Wrench, MapPin, DollarSign, Cable } from "lucide-react";
import { motion } from "framer-motion";
import PanelSettings from "./PanelSettings";
import StringConfigTable from "./StringConfigTable";

export default function SiteConfiguration({ site }) {
  const [configTab, setConfigTab] = useState('general');

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
    num_inverters: site.num_inverters || 1,
    panel_watt: site.panel_watt ?? '',
    panel_voltage: site.panel_voltage ?? '',
    panel_amperage: site.panel_amperage ?? '',
    peak_sun_hours: site.peak_sun_hours ?? '',
    annual_kwh_per_kwp: site.annual_kwh_per_kwp ?? '',
    string_configs: site.string_configs || [],
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
      num_inverters: parseInt(config.num_inverters),
      panel_watt: parseFloat(config.panel_watt),
      panel_voltage: parseFloat(config.panel_voltage),
      panel_amperage: parseFloat(config.panel_amperage),
      peak_sun_hours: parseFloat(config.peak_sun_hours),
      annual_kwh_per_kwp: parseFloat(config.annual_kwh_per_kwp),
      string_configs: config.string_configs,
    });
  };

  const handlePanelChange = (field, value) => {
    const updated = { ...config, [field]: value };
    // Recalculate all strings when panel specs change
    if (['panel_voltage', 'panel_amperage', 'panel_watt'].includes(field)) {
      updated.string_configs = (updated.string_configs || []).map(s => ({
        ...s,
        expected_voltage: parseFloat(((s.num_panels || 0) * (field === 'panel_voltage' ? value : updated.panel_voltage)).toFixed(1)),
        expected_amperage: field === 'panel_amperage' ? value : updated.panel_amperage,
        expected_power_w: (s.num_panels || 0) * (field === 'panel_watt' ? value : updated.panel_watt),
      }));
    }
    setConfig(updated);
  };

  const generalSections = [
    {
      title: 'מידע כללי',
      icon: Settings,
      color: '#16a34a',
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
      color: '#3b82f6',
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
      color: '#f59e0b',
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
      color: '#8b5cf6',
      fields: [
        { key: 'tariff_per_kwh', label: 'תעריף (₪/kWh)', type: 'number', step: '0.01' },
        { key: 'initial_investment', label: 'השקעה ראשונית (₪)', type: 'number' },
        { key: 'cleaning_interval_days', label: 'מרווח ניקוי (ימים)', type: 'number' },
        { key: 'peak_sun_hours', label: 'שעות שמש שיא ביום (PSH)', type: 'number', step: '0.1' },
        { key: 'annual_kwh_per_kwp', label: 'kWh שנתי לכל kWp', type: 'number' }
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-50">
            <Settings className="w-5 h-5 text-green-600" />
          </div>
          הגדרות מערכת
        </h2>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="gap-2 font-bold bg-green-600 hover:bg-green-700 text-white"
        >
          <Save className="w-4 h-4" />
          {updateMutation.isPending ? 'שומר...' : 'שמור שינויים'}
        </Button>
      </div>

      <Tabs value={configTab} onValueChange={setConfigTab}>
        <TabsList className="bg-white p-1 border border-slate-200 h-10 rounded-xl grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="general" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-700 text-slate-500 rounded-lg text-sm gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            כללי
          </TabsTrigger>
          <TabsTrigger value="strings" className="data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 text-slate-500 rounded-lg text-sm gap-1.5">
            <Cable className="w-3.5 h-3.5" />
            פאנלים וסטרינגים
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {generalSections.map((section, idx) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className="p-5 border border-slate-200 shadow-sm bg-white" style={{ borderTop: `3px solid ${section.color}` }}>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="p-2 rounded-lg" style={{ background: `${section.color}15` }}>
                      <section.icon className="w-4 h-4" style={{ color: section.color }} />
                    </div>
                    <h3 className="text-base font-bold text-slate-800">{section.title}</h3>
                  </div>
                  <div className="space-y-3">
                    {section.fields.map(field => (
                      <div key={field.key} className="space-y-1">
                        <Label className="text-xs text-slate-500">{field.label}</Label>
                        {field.type === 'select' ? (
                          <Select
                            value={config[field.key]?.toString()}
                            onValueChange={(v) => setConfig({...config, [field.key]: v})}
                          >
                            <SelectTrigger className="border-slate-200">
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
                            className="border-slate-200"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="strings" className="mt-4 space-y-4 md:space-y-6">
          <PanelSettings
            panelWatt={config.panel_watt}
            panelVoltage={config.panel_voltage}
            panelAmperage={config.panel_amperage}
            onChange={handlePanelChange}
          />
          <StringConfigTable
            strings={config.string_configs}
            panelWatt={parseFloat(config.panel_watt) || 0}
            panelVoltage={parseFloat(config.panel_voltage) || 0}
            panelAmperage={parseFloat(config.panel_amperage) || 0}
            peakSunHours={parseFloat(config.peak_sun_hours) || 0}
            onChange={(newStrings) => setConfig({ ...config, string_configs: newStrings })}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}