import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Zap } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const REGION_LABELS = { north: 'צפון', center: 'מרכז', south: 'דרום', arava: 'ערבה' };

export default function SiteSearch({ sites }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const results = query.trim().length > 0
    ? (sites || []).filter(s => s.name?.includes(query))
    : [];

  return (
    <div className="relative w-full max-w-xs" ref={ref}>
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          placeholder="חיפוש אתר..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.trim() && setOpen(true)}
          className="pr-9 h-9 text-sm border-slate-200 bg-white"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 right-0 left-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {results.map(site => (
            <Link
              key={site.id}
              to={createPageUrl(`SiteDetails?id=${site.id}`)}
              onClick={() => { setOpen(false); setQuery(''); }}
              className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${site.status === 'online' ? 'bg-green-500' : site.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium text-slate-800 truncate">{site.name}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0 mr-2">
                <span className="flex items-center gap-0.5">
                  <MapPin className="w-3 h-3" />
                  {REGION_LABELS[site.region_tag] || site.region_tag}
                </span>
                <span className="flex items-center gap-0.5">
                  <Zap className="w-3 h-3" />
                  {site.dc_capacity_kwp} kWp
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {open && query.trim().length > 0 && results.length === 0 && (
        <div className="absolute top-full mt-1 right-0 left-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-4 text-center text-sm text-slate-400">
          לא נמצאו אתרים
        </div>
      )}
    </div>
  );
}