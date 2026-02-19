import React from "react";
import { motion } from "framer-motion";

const filters = [
  { key: "all", label: "כל האתרים" },
  { key: "delkal_energy", label: "דלקל אנרגיה" },
  { key: "external_client", label: "לקוחות חיצוניים" },
  { key: "faulty", label: "תקלות / לא מקוון" },
];

export default function SiteFilters({ active, onChange, counts }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {filters.map(f => {
        const isActive = active === f.key;
        const count = counts[f.key] || 0;
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={`relative px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200
              ${isActive
                ? "text-[#00ff88] bg-[#00ff88]/10"
                : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#242b35]"
              }`}
          >
            {f.label}
            <span className={`mr-1.5 text-[10px] px-1.5 py-0.5 rounded-full
              ${isActive ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-[#30363d] text-[#8b949e]"}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}