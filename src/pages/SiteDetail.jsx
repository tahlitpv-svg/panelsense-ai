import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import SiteHeader from "../components/site/SiteHeader";
import SiteMetrics from "../components/site/SiteMetrics";
import InverterTable from "../components/site/InverterTable";
import MpptAnalysis from "../components/site/MpptAnalysis";
import { Loader2 } from "lucide-react";

export default function SiteDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const siteId = urlParams.get("id");
  const [selectedInverter, setSelectedInverter] = useState(null);

  const { data: sites = [], isLoading: siteLoading } = useQuery({
    queryKey: ["site", siteId],
    queryFn: () => base44.entities.Site.filter({ id: siteId }),
    enabled: !!siteId,
    staleTime: 30_000,
  });

  const site = sites[0];

  const { data: inverters = [] } = useQuery({
    queryKey: ["inverters", siteId],
    queryFn: () => base44.entities.Inverter.filter({ site_id: siteId }),
    enabled: !!siteId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (siteLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">האתר לא נמצא</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <SiteHeader site={site} />
      <SiteMetrics site={site} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InverterTable inverters={inverters} onSelect={setSelectedInverter} />
        <MpptAnalysis inverter={selectedInverter} />
      </div>
    </div>
  );
}
