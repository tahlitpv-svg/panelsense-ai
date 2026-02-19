import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, X, Loader2, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const emptyForm = {
  name: "", owner: "delkal_energy", dc_capacity_kwp: "", ac_capacity_kw: "",
  inverter_type: "", panel_type: "", azimuth_deg: "", tilt_deg: "",
  mounting_type: "roof", latitude: "", longitude: "", region_tag: "center",
  tariff_per_kwh: "0.48", initial_investment: "", installation_date: "",
  cleaning_interval_days: "90", num_inverters: "1",
};

export default function SiteManager() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Site.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sites"] }); closeForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Site.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sites"] }); closeForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Site.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sites"] }),
  });

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };

  const openEdit = (site) => {
    setForm({
      name: site.name || "", owner: site.owner || "delkal_energy",
      dc_capacity_kwp: site.dc_capacity_kwp?.toString() || "",
      ac_capacity_kw: site.ac_capacity_kw?.toString() || "",
      inverter_type: site.inverter_type || "", panel_type: site.panel_type || "",
      azimuth_deg: site.azimuth_deg?.toString() || "", tilt_deg: site.tilt_deg?.toString() || "",
      mounting_type: site.mounting_type || "roof",
      latitude: site.latitude?.toString() || "", longitude: site.longitude?.toString() || "",
      region_tag: site.region_tag || "center",
      tariff_per_kwh: site.tariff_per_kwh?.toString() || "0.48",
      initial_investment: site.initial_investment?.toString() || "",
      installation_date: site.installation_date || "",
      cleaning_interval_days: site.cleaning_interval_days?.toString() || "90",
      num_inverters: site.num_inverters?.toString() || "1",
    });
    setEditingId(site.id);
    setShowForm(true);
  };

  const handleSave = () => {
    const data = {
      ...form,
      dc_capacity_kwp: parseFloat(form.dc_capacity_kwp) || 0,
      ac_capacity_kw: parseFloat(form.ac_capacity_kw) || 0,
      azimuth_deg: parseFloat(form.azimuth_deg) || 0,
      tilt_deg: parseFloat(form.tilt_deg) || 0,
      latitude: parseFloat(form.latitude) || 0,
      longitude: parseFloat(form.longitude) || 0,
      tariff_per_kwh: parseFloat(form.tariff_per_kwh) || 0.48,
      initial_investment: parseFloat(form.initial_investment) || 0,
      cleaning_interval_days: parseInt(form.cleaning_interval_days) || 90,
      num_inverters: parseInt(form.num_inverters) || 1,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const Field = ({ label, field, type = "text", placeholder }) => (
    <div className="space-y-1">
      <Label className="text-[11px] text-[#8b949e]">{label}</Label>
      <Input
        type={type}
        value={form[field]}
        onChange={e => setForm({ ...form, [field]: e.target.value })}
        placeholder={placeholder}
        className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] text-sm h-9"
      />
    </div>
  );

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-[#00ff88] animate-spin" /></div>;
  }

  return (
    <div className="max-w-[1000px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">ניהול אתרים</h1>
          <p className="text-sm text-[#8b949e] mt-1">{sites.length} אתרים רשומים</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}
          className="bg-[#00ff88] text-[#0d1117] hover:bg-[#00cc6a] text-xs font-semibold">
          <Plus className="w-4 h-4 ml-1" /> הוסף אתר
        </Button>
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="glass-card rounded-xl p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-[#e6edf3]">{editingId ? "ערוך אתר" : "אתר חדש"}</h3>
              <button onClick={closeForm} className="text-[#8b949e] hover:text-[#e6edf3]"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <Field label="שם האתר" field="name" placeholder="שם האתר" />
              <div className="space-y-1">
                <Label className="text-[11px] text-[#8b949e]">בעלות</Label>
                <Select value={form.owner} onValueChange={v => setForm({ ...form, owner: v })}>
                  <SelectTrigger className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] text-sm h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="delkal_energy">דלקל אנרגיה</SelectItem><SelectItem value="external_client">לקוח חיצוני</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-[#8b949e]">אזור</Label>
                <Select value={form.region_tag} onValueChange={v => setForm({ ...form, region_tag: v })}>
                  <SelectTrigger className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] text-sm h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="north">צפון</SelectItem><SelectItem value="center">מרכז</SelectItem><SelectItem value="south">דרום</SelectItem><SelectItem value="arava">ערבה</SelectItem></SelectContent>
                </Select>
              </div>
              <Field label="קיבולת DC (kWp)" field="dc_capacity_kwp" type="number" />
              <Field label="קיבולת AC (kW)" field="ac_capacity_kw" type="number" />
              <Field label="סוג ממיר" field="inverter_type" placeholder="SolarEdge SE..." />
              <Field label="סוג פאנל" field="panel_type" placeholder="Jinko 550W" />
              <Field label="אזימוט (°)" field="azimuth_deg" type="number" />
              <Field label="שיפוע (°)" field="tilt_deg" type="number" />
              <div className="space-y-1">
                <Label className="text-[11px] text-[#8b949e]">סוג הרכבה</Label>
                <Select value={form.mounting_type} onValueChange={v => setForm({ ...form, mounting_type: v })}>
                  <SelectTrigger className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] text-sm h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="roof">גג</SelectItem><SelectItem value="ground">קרקע</SelectItem><SelectItem value="tracker">עוקב שמש</SelectItem></SelectContent>
                </Select>
              </div>
              <Field label="קו רוחב" field="latitude" type="number" />
              <Field label="קו אורך" field="longitude" type="number" />
              <Field label="תעריף ₪/kWh" field="tariff_per_kwh" type="number" />
              <Field label="השקעה ₪" field="initial_investment" type="number" />
              <Field label="תאריך התקנה" field="installation_date" type="date" />
              <Field label="מרווח ניקוי (ימים)" field="cleaning_interval_days" type="number" />
              <Field label="מספר ממירים" field="num_inverters" type="number" />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="ghost" onClick={closeForm} className="text-[#8b949e] text-xs">ביטול</Button>
              <Button onClick={handleSave} className="bg-[#00ff88] text-[#0d1117] hover:bg-[#00cc6a] text-xs font-semibold">
                <Save className="w-4 h-4 ml-1" /> {editingId ? "עדכן" : "צור אתר"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sites list */}
      <div className="space-y-3">
        {sites.map(site => (
          <div key={site.id} className="glass-card rounded-xl p-4 flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: site.status === "online" ? "#00ff88" : site.status === "warning" ? "#ffaa00" : "#ff3333" }} />
              <div>
                <p className="text-sm font-semibold text-[#e6edf3]">{site.name}</p>
                <p className="text-[11px] text-[#8b949e]">{site.dc_capacity_kwp || 0} kWp · {site.region_tag}</p>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" onClick={() => openEdit(site)} className="text-[#8b949e] hover:text-[#58a6ff]">
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { if (confirm("למחוק את האתר?")) deleteMutation.mutate(site.id); }} className="text-[#8b949e] hover:text-[#ff3333]">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}