import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LayoutDashboard, FileText, Zap } from 'lucide-react';

export default function Layout({ children, currentPageName }) {
  const navItems = [
    { name: 'Dashboard', label: 'דאשבורד', icon: LayoutDashboard },
    { name: 'Reports', label: 'דוחות', icon: FileText }
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0d1117' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: .7;
          }
        }
        
        body {
          font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
          direction: rtl;
        }
        
        * {
          scrollbar-width: thin;
          scrollbar-color: #00ff88 #1a1f2e;
        }
        
        *::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        *::-webkit-scrollbar-track {
          background: #1a1f2e;
        }
        
        *::-webkit-scrollbar-thumb {
          background: #00ff88;
          border-radius: 4px;
        }
        
        *::-webkit-scrollbar-thumb:hover {
          background: #00cc6f;
        }
      `}</style>

      <nav className="border-b shadow-xl sticky top-0 z-50 backdrop-blur-lg"
           style={{ 
             background: 'rgba(13, 17, 23, 0.95)', 
             borderColor: '#1a1f2e'
           }}>
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: '#00ff8820' }}>
                <Zap className="w-6 h-6" style={{ color: '#00ff88' }} />
              </div>
              <div>
                <div className="text-xl font-bold" style={{ color: '#00ff88' }}>
                  Delkal Energy
                </div>
                <div className="text-xs text-gray-400">Fleet Control Tower</div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = currentPageName === item.name;
                
                return (
                  <Link
                    key={item.name}
                    to={createPageUrl(item.name)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium"
                    style={{
                      background: isActive ? '#00ff8820' : 'transparent',
                      color: isActive ? '#00ff88' : '#9ca3af',
                      borderBottom: isActive ? '2px solid #00ff88' : 'none'
                    }}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      <main>
        {children}
      </main>
    </div>
  );
}