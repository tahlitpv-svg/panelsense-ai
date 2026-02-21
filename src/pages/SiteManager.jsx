import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, X, Loader2, Save, Droplets, MapPin, Search } from "lucide-react";
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
  const [searchTerm, setSearchTerm] = useState("");
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

  const markCleanedMutation = useMutation({
    mutationFn: (id) => base44.entities.Site.update(id, {
      last_cleaning_date: new Date().toISOString().split('T')[0],
      cleaning_recommended: false
    }),
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
      <Label className="text-xs font-medium text-slate-500">{label}</Label>
      <Input
        type={type}
        value={form[field]}
        onChange={e => setForm({ ...form, [field]: e.target.value })}
        placeholder={placeholder}
        className="bg-white border-slate-200 focus:border-orange-500 focus:ring-orange-500/20 text-slate-800 text-sm h-9 transition-all"
      />
    </div>
  );

  const filteredSites = sites.filter(site => 
    site.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ניהול אתרים</h1>
          <p className="text-slate-500 mt-1">
            {sites.length} מערכות סולאריות רשומות במערכת
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
             <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <Input 
                placeholder="חיפוש אתר..." 
                className="bg-white pl-3 pr-9 border-slate-200 focus:border-orange-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
          <Button 
            onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}
            className="bg-orange-500 hover:bg-orange-600 text-white font-medium"
          >
            <Plus className="w-4 h-4 ml-2" /> הוסף מערכת
          </Button>
        </div>
      </motion.div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: "auto" }} 
            exit={{ opacity: 0, height: 0 }}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">
                {editingId ? "עריכת מערכת סולארית" : "מערכת סולארית חדשה"}
              </h3>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              <Field label="שם האתר" field="name" placeholder="שם האתר" />
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-500">בעלות</Label>
                <Select value={form.owner} onValueChange={v => setForm({ ...form, owner: v })}>
                  <SelectTrigger className="bg-white border-slate-200 text-slate-800 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="delkal_energy">דלקל אנרגיה</SelectItem><SelectItem value="external_client">לקוח חיצוני</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-500">אזור</Label>
                <Select value={form.region_tag} onValueChange={v => setForm({ ...form, region_tag: v })}>
                  <SelectTrigger className="bg-white border-slate-200 text-slate-800 h-9"><SelectValue /></SelectTrigger>
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
                <Label className="text-xs font-medium text-slate-500">סוג הרכבה</Label>
                <Select value={form.mounting_type} onValueChange={v => setForm({ ...form, mounting_type: v })}>
                  <SelectTrigger className="bg-white border-slate-200 text-slate-800 h-9"><SelectValue /></SelectTrigger>
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
            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={closeForm} className="text-slate-600 border-slate-200 hover:bg-slate-50">ביטול</Button>
              <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold">
                <Save className="w-4 h-4 ml-2" /> {editingId ? "שמור שינויים" : "צור אתר"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sites list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredSites.map((site, i) => (
          <motion.div
            key={site.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4 }}
          >
            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className={`w-3 h-3 rounded-full ${site.status === "online" ? "bg-emerald-500" : site.status === "warning" ? "bg-amber-500" : "bg-red-500"}`}
                  />
                  <div>
                    <p className="font-bold text-slate-800 text-lg group-hover:text-orange-600 transition-colors">{site.name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                       <MapPin className="w-3 h-3" />
                       {site.region_tag} · {site.dc_capacity_kwp || 0} kWp
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-50">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => openEdit(site)} 
                    className="flex-1 border-slate-200 text-slate-600 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50"
                  >
                    <Pencil className="w-3 h-3 ml-2" />
                    ערוך
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => { if (confirm("למחוק את האתר?")) deleteMutation.mutate(site.id); }} 
                    className="flex-1 border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3 ml-2" />
                    מחק
                  </Button>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => markCleanedMutation.mutate(site.id)} 
                  className="w-full text-blue-600 bg-blue-50 hover:bg-blue-100"
                >
                  <Droplets className="w-3 h-3 ml-2" />
                  סמן כשטוף
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}