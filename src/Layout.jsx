import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  LayoutDashboard,
  Map,
  Bell,
  FileText,
  Settings,
  Sun,
  Menu,
  X,
  Zap,
  ChevronLeft
} from "lucide-react";

const navItems = [
  { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
  { name: "מפת צי", icon: Map, page: "FleetMap" },
  { name: "התראות", icon: Bell, page: "Alerts" },
  { name: "דוחות", icon: FileText, page: "Reports" },
  { name: "הגדרות", icon: Settings, page: "SiteManager" },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen flex" dir="rtl" style={{ background: '#0d1117' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 h-screen z-50 flex flex-col transition-all duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
          ${collapsed ? "w-[72px]" : "w-64"}
        `}
        style={{ background: '#161b22', borderLeft: '1px solid #30363d' }}
      >
        {/* Logo */}
        <div className={`flex items-center gap-3 p-5 border-b border-[#30363d] ${collapsed ? "justify-center" : ""}`}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: 'linear-gradient(135deg, #00ff88, #00cc6a)' }}>
            <Zap className="w-5 h-5 text-[#0d1117]" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-bold text-[#e6edf3] tracking-wide">DELKAL</h1>
              <p className="text-[10px] text-[#8b949e] tracking-widest">SMART MONITORING</p>
            </div>
          )}
          <button
            className="lg:hidden mr-auto text-[#8b949e] hover:text-[#e6edf3]"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group
                  ${collapsed ? "justify-center" : ""}
                  ${isActive
                    ? "bg-[#00ff88]/10 text-[#00ff88]"
                    : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#242b35]"
                  }`}
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-[#00ff88]" : ""}`} />
                {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
                {isActive && !collapsed && (
                  <div className="mr-auto w-1.5 h-1.5 rounded-full bg-[#00ff88]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle - desktop only */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center p-3 border-t border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen overflow-x-hidden">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3"
                style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #00ff88, #00cc6a)' }}>
              <Zap className="w-4 h-4 text-[#0d1117]" />
            </div>
            <span className="text-sm font-bold text-[#e6edf3]">DELKAL</span>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-[#8b949e] hover:text-[#e6edf3]"
          >
            <Menu className="w-6 h-6" />
          </button>
        </header>

        <div className="p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}