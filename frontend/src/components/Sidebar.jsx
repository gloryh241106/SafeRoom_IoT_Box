/** Responsive route navigation shared by desktop and mobile layouts. */
import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LineChart, MessageSquareCode, Settings } from 'lucide-react';

export default function Sidebar() {
  // One route registry feeds both renderings so labels and permissions cannot drift.
  const navItems = [
    { path: '/overview', label: 'Overview', icon: LayoutDashboard },
    { path: '/dashboard', label: 'Dashboard & Charts', icon: LineChart },
    { path: '/chatbot', label: 'AI & Intent Assistant', icon: MessageSquareCode },
    { path: '/settings', label: 'Settings & Matrix', icon: Settings },
  ];

  return (
    <>
      <aside className="w-64 border-r border-slate-200 bg-white min-h-[calc(100vh-4rem)] p-4 flex-col justify-between hidden md:flex">
        <div className="space-y-1">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors border ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'text-slate-600 border-transparent hover:text-slate-950 hover:bg-slate-100'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Static hardware inventory; connection state is displayed on Overview. */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Device Matrix</h4>
          <p className="text-xs text-slate-500">ESP32 DevKit V1</p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>DHT22, PIR, MQ2</span>
          </div>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white px-2 py-2 md:hidden" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const mobileLabel = item.label.split(' ')[0];
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{mobileLabel}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
