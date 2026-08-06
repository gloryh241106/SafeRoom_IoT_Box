import React from 'react';
import { Shield, User, Wifi, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
          <Shield className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-base sm:text-lg text-white whitespace-nowrap">Safebox<span className="text-blue-500">Manager</span></h1>
          <p className="text-xs text-slate-400 hidden sm:block">SafeRoom IoT Safety Management</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {/* Status indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium">
          <Wifi className="w-3.5 h-3.5" />
          <span>safebox-01</span>
        </div>

        {user ? (
          <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>
            <span className="text-sm font-medium text-slate-200 hidden md:block">{user.username}</span>
            <button
              onClick={onLogout}
              title="Logout"
              className="p-1.5 text-slate-400 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-800"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            title="Sign in"
            className="p-2 sm:px-4 sm:py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all flex items-center gap-2"
          >
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}
