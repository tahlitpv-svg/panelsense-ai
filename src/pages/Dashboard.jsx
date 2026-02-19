import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import KpiRibbon from "../components/dashboard/KpiRibbon";
import SiteCard from "../components/dashboard/SiteCard";
import SiteFilters from "../components/dashboard/SiteFilters";
import FleetOverviewChart from "../components/dashboard/FleetOverviewChart";
import RecentAlerts from "../components/dashboard/RecentAlerts";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function Dashboard() {
  const [filter, setFilter] = useState("all");

  const { data: sites = [], isLoading: sitesLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date"),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => base44.entities.Alert.list("-created_date", 20),
  });

  const counts = {
    all: sites.length,
    delkal_energy: sites.filter(s => s.owner === "delkal_energy").length,
    external_client: sites.filter(s => s.owner === "external_client").length,
    faulty: sites.filter(s => s.status === "offline" || s.status === "warning").length,
  };

  const filteredSites = sites.filter(s => {
    if (filter === "all") return true;
    if (filter === "delkal_energy") return s.owner === "delkal_energy";
    if (filter === "external_client") return s.owner === "external_client";
    if (filter === "faulty") return s.status === "offline" || s.status === "warning";
    return true;
  });

  if (sitesLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-[#00ff88] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Page Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">מגדל הבקרה</h1>
          <p className="text-sm text-[#8b949e] mt-1">ניטור בזמן אמת של כל מערכות הצי</p>
        </div>
        <div className="text-xs text-[#8b949e] text-left">
          <span className="block">{new Date().toLocaleDateString("he-IL", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </motion.div>

      {/* KPI Ribbon */}
      <KpiRibbon sites={sites} />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sites List - 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          <SiteFilters active={filter} onChange={setFilter} counts={counts} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSites.map((site, i) => (
              <SiteCard key={site.id} site={site} index={i} />
            ))}
          </div>
          {filteredSites.length === 0 && (
            <div className="text-center py-16 glass-card rounded-xl">
              <p className="text-[#8b949e] text-sm">לא נמצאו אתרים בקטגוריה זו</p>
            </div>
          )}
        </div>

        {/* Sidebar - 1 col */}
        <div className="space-y-6">
          <FleetOverviewChart sites={sites} />
          <RecentAlerts alerts={alerts} />
        </div>
      </div>
    </div>
  );
}