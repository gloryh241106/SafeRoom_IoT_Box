import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LineChart, MessageSquareCode, Settings } from 'lucide-react';

export default function Sidebar() {
  const navItems = [
    { path: '/overview', label: 'Overview', icon: LayoutDashboard },
    { path: '/dashboard', label: 'Dashboard & Charts', icon: LineChart },
    { path: '/chatbot', label: 'AI & Intent Assistant', icon: MessageSquareCode },
    { path: '/settings', label: 'Settings & Matrix', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/40 min-h-[calc(100vh-4rem)] p-4 flex flex-col justify-between hidden md:flex">
      <div className="space-y-1">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="glass-card p-4 rounded-2xl border border-slate-800/80">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Device Matrix</h4>
        <p className="text-xs text-slate-400">ESP32 DevKit V1</p>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>DHT22, PIR, MQ2</span>
        </div>
      </div>
    </aside>
  );
}
