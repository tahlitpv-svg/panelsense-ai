import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LayoutDashboard, FileText, Settings, ChevronLeft, Menu, Zap, Users, Sliders, ShieldAlert } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me()
  });

  const baseNavItems = [
    { name: 'Dashboard', label: 'דאשבורד', icon: LayoutDashboard },
    { name: 'Reports', label: 'דוחות', icon: FileText },
    { name: 'SiteManager', label: 'ניהול אתרים', icon: Settings },
    { name: 'SystemSettings', label: 'הגדרות מערכת', icon: Sliders },
    { name: 'Faults', label: 'סוגי תקלות', icon: ShieldAlert }
  ];

  const navItems = user?.role === 'admin' 
    ? [...baseNavItems, { name: 'AdminPanel', label: 'ניהול לקוחות', icon: Users }] 
    : baseNavItems;

  // Hide sidebar page names that don't need bottom nav
  const isSiteDetail = currentPageName === 'SiteDetails' || currentPageName === 'SiteDetail';

  const mainRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);

  // Handle Sungrow OAuth2 callback - redirect to SungrowAuth page if code is in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code && currentPageName !== 'SungrowAuth') {
      window.location.href = createPageUrl('SungrowAuth') + '&code=' + encodeURIComponent(code);
    }
  }, []);

  if (currentPageName === 'PanelLayoutEditor') {
    return <div className="min-h-screen bg-slate-100">{children}</div>;
  }

  return (
    <div className="min-h-screen flex flex-row-reverse overflow-hidden bg-slate-50 text-slate-900" dir="rtl">

      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside
        className={cn(
          "hidden md:flex h-screen sticky top-0 z-50 flex-col transition-all duration-300 border-l bg-white border-slate-200 shadow-sm",
          sidebarOpen ? "w-64" : "w-20"
        )}
      >
        {/* Logo */}
        <div className="p-4 h-16 flex items-center border-b border-slate-100">
          <div className={cn("flex items-center gap-3 overflow-hidden", !sidebarOpen && "justify-center w-full")}>
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6996c82e2d9ffee94ec1d06d/3c09ddb08_file_000000001d3871fda61e9907e2495b87.png" 
              alt="Panel Sense AI" 
              className="shrink-0 w-9 h-9 rounded-lg object-cover"
            />
            {sidebarOpen && (
              <div>
                <div className="font-bold text-slate-900 text-sm leading-tight">Panel Sense</div>
                <div className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider">AI</div>
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

      {/* ── Main ── */}
      <main ref={mainRef} className="flex-1 overflow-auto">
        {/* Header */}
        <header className="h-14 md:h-16 sticky top-0 z-40 border-b border-slate-200 px-4 md:px-8 flex items-center justify-between bg-white/95 backdrop-blur-md">
          <div className="flex items-center gap-2 md:gap-3">
            {/* Mobile logo */}
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6996c82e2d9ffee94ec1d06d/3c09ddb08_file_000000001d3871fda61e9907e2495b87.png" 
              alt="Panel Sense AI" 
              className="flex md:hidden w-8 h-8 rounded-lg object-cover"
            />
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">
              LIVE
            </span>
            <span className="hidden sm:block text-slate-500 text-sm font-medium">מערכת ניהול ובקרה</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-600 font-medium">
              <Zap className="w-4 h-4 text-cyan-500" />
              <span>Panel Sense AI</span>
            </div>
            <div className="h-8 w-8 rounded-full overflow-hidden border-2 border-cyan-200 shadow-sm">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=PanelSense`} alt="User" />
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto pb-24 md:pb-8">
          {children}
        </div>

        {/* ── Mobile Bottom Nav (visible only on mobile, not on detail pages) ── */}
        {!isSiteDetail && (
          <nav className="md:hidden fixed bottom-0 right-0 left-0 z-50 bg-white border-t border-slate-200 flex justify-around items-center h-16 px-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentPageName === item.name;
              return (
                <Link
                  key={item.name}
                  to={createPageUrl(item.name)}
                  className={cn(
                    "flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-all",
                    isActive ? "text-green-700" : "text-slate-400"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive && "text-green-600")} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                  {isActive && <div className="w-1 h-1 rounded-full bg-green-500" />}
                </Link>
              );
            })}
          </nav>
        )}
      </main>
    </div>
  );
}