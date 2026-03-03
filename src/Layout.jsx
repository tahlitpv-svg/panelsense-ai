import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LayoutDashboard, FileText, Settings, ChevronLeft, Menu, Zap } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navItems = [
    { name: 'Dashboard', label: 'דאשבורד', icon: LayoutDashboard },
    { name: 'Reports', label: 'דוחות', icon: FileText },
    { name: 'SiteManager', label: 'ניהול אתרים', icon: Settings }
  ];

  return (
    <div className="min-h-screen flex flex-row-reverse overflow-hidden" dir="rtl" style={{ background: '#0d1117' }}>
      {/* Sidebar */}
      <aside
        className={cn(
          "h-screen sticky top-0 z-50 flex flex-col transition-all duration-300 border-l",
          sidebarOpen ? "w-64" : "w-20"
        )}
        style={{
          background: 'linear-gradient(180deg, #111827 0%, #0d1117 100%)',
          borderColor: 'rgba(74,222,128,0.1)'
        }}
      >
        {/* Logo */}
        <div className="p-4 h-16 flex items-center border-b" style={{ borderColor: 'rgba(74,222,128,0.1)' }}>
          <div className={cn("flex items-center gap-3 overflow-hidden", !sidebarOpen && "justify-center w-full")}>
            <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ background: 'linear-gradient(135deg, #4ade80, #16a34a)', boxShadow: '0 0 16px rgba(74,222,128,0.3)' }}>
              <span className="text-white font-black text-lg leading-none">D</span>
            </div>
            {sidebarOpen && (
              <div>
                <div className="font-bold text-white text-sm leading-tight">Delkal</div>
                <div className="text-[10px] font-medium" style={{ color: '#4ade80' }}>Energy Control</div>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPageName === item.name;
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.name)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl transition-all font-medium group relative",
                  isActive ? "text-white" : "text-slate-400 hover:text-slate-200"
                )}
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(74,222,128,0.15), rgba(22,163,74,0.08))',
                  borderRight: '2px solid #4ade80',
                  boxShadow: 'inset 0 0 20px rgba(74,222,128,0.05)'
                } : {}}
              >
                <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-green-400" : "text-slate-500 group-hover:text-slate-300")} />
                {sidebarOpen && <span className="text-sm">{item.label}</span>}
                {!sidebarOpen && (
                  <div className="absolute left-10 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity border border-slate-700">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t" style={{ borderColor: 'rgba(74,222,128,0.1)' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-300 transition-colors hover:bg-white/5"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="h-16 sticky top-0 z-40 border-b px-8 flex items-center justify-between"
          style={{
            background: 'rgba(13,17,23,0.95)',
            backdropFilter: 'blur(12px)',
            borderColor: 'rgba(74,222,128,0.1)'
          }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>
              LIVE
            </span>
            <span className="text-slate-400 text-sm">מערכת ניהול ובקרה</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Zap className="w-4 h-4 text-green-400" />
              <span>Fleet Control Tower</span>
            </div>
            <div className="h-8 w-8 rounded-full overflow-hidden ring-2" style={{ ringColor: '#4ade80', border: '2px solid rgba(74,222,128,0.4)' }}>
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Delkal`} alt="User" />
            </div>
          </div>
        </header>

        <div className="p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}