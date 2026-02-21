import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LayoutDashboard, FileText, Zap, Settings, Menu, X, ChevronLeft, Sun } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navItems = [
    { name: 'Dashboard', label: 'דאשבורד', icon: LayoutDashboard },
    { name: 'Reports', label: 'דוחות', icon: FileText },
    { name: 'SiteManager', label: 'ניהול אתרים', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex flex-row-reverse overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-gradient-to-b from-white to-slate-50 border-l border-slate-200 h-screen sticky top-0 transition-all duration-300 z-50 flex flex-col shadow-xl",
          sidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="p-4 flex items-center justify-between border-b border-gray-100 h-16">
          <div className={cn("flex items-center gap-3 overflow-hidden", !sidebarOpen && "justify-center w-full")}>
            <div className="bg-orange-500 p-2 rounded-lg shrink-0">
              <Zap className="w-5 h-5 text-white" />
            </div>
            {sidebarOpen && (
              <div className="font-bold text-lg text-slate-800 whitespace-nowrap">
                Delkal <span className="text-orange-500">Energy</span>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPageName === item.name;
            
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.name)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl transition-all font-medium group relative overflow-hidden",
                  isActive 
                    ? "bg-orange-50 text-orange-600 shadow-sm ring-1 ring-orange-200" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {isActive && (
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-orange-500 rounded-l-full" />
                )}
                <Icon className={cn("w-5 h-5 shrink-0 transition-colors", isActive ? "text-orange-500" : "text-slate-400 group-hover:text-slate-600")} />
                {sidebarOpen && <span>{item.label}</span>}
                
                {!sidebarOpen && (
                  <div className="absolute left-10 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-transparent">
        <header className="h-16 bg-white/80 backdrop-blur-sm sticky top-0 z-40 border-b border-gray-200 px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
             <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-semibold">BETA</span>
             <span>מערכת ניהול ובקרה</span>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 pr-4 border-r border-gray-200">
                <Sun className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-medium text-slate-600">יום שמשי</span>
             </div>
             <div className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden">
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