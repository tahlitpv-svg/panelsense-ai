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
    <div className="min-h-screen flex flex-row-reverse overflow-hidden bg-slate-50 text-slate-900" dir="rtl">
      {/* Sidebar */}
      <aside
        className={cn(
          "h-screen sticky top-0 z-50 flex flex-col transition-all duration-300 border-l bg-white border-slate-200 shadow-sm",
          sidebarOpen ? "w-64" : "w-20"
        )}
      >
        {/* Logo */}
        <div className="p-4 h-16 flex items-center border-b border-slate-100">
          <div className={cn("flex items-center gap-3 overflow-hidden", !sidebarOpen && "justify-center w-full")}>
            <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', boxShadow: '0 4px 10px rgba(22,163,74,0.2)' }}>
              <span className="text-white font-black text-lg leading-none">D</span>
            </div>
            {sidebarOpen && (
              <div>
                <div className="font-bold text-slate-900 text-sm leading-tight">Delkal</div>
                <div className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Energy Control</div>
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
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium group relative",
                  isActive ? "text-green-700 bg-green-50" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                )}
                style={isActive ? { borderRight: '3px solid #16a34a' } : { borderRight: '3px solid transparent' }}
              >
                <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-green-600" : "text-slate-400 group-hover:text-slate-600")} />
                {sidebarOpen && <span className="text-sm">{item.label}</span>}
                {!sidebarOpen && (
                  <div className="absolute left-10 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-700 transition-colors hover:bg-slate-50"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="h-16 sticky top-0 z-40 border-b border-slate-200 px-8 flex items-center justify-between bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">
              LIVE
            </span>
            <span className="text-slate-500 text-sm font-medium">מערכת ניהול ובקרה</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
              <Zap className="w-4 h-4 text-green-500" />
              <span>Fleet Control Tower</span>
            </div>
            <div className="h-8 w-8 rounded-full overflow-hidden border-2 border-green-200 shadow-sm">
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