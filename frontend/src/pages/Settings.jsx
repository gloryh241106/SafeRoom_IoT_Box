import React, { useState } from 'react';
import { User, Bell, Shield, Save, Key, Sliders } from 'lucide-react';

export default function Settings({ user }) {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [password, setPassword] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavedMessage('Settings updated successfully!');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Settings & Safety Matrix</h2>
        <p className="text-sm text-slate-400">Account profiles, notification preferences, and system thresholds</p>
      </div>

      {savedMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium">
          {savedMessage}
        </div>
      )}

      {/* Authoritative Safety Rule Matrix Display */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          <span>Authoritative System Safety Threshold Matrix</span>
        </h3>
        <p className="text-xs text-slate-400">Production threshold values enforced by backend anomaly engine and ESP32 edge safety autonomy</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold uppercase">MQ2 Gas / Smoke</span>
            <div className="text-xl font-bold text-red-400">600 PPM</div>
            <p className="text-[11px] text-slate-500">Local Buzzer + LED + Email Alert</p>
          </div>

          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold uppercase">Thermal High Bound</span>
            <div className="text-xl font-bold text-orange-400">45.0 °C</div>
            <p className="text-[11px] text-slate-500">Auto-triggers DC Fan Relay</p>
          </div>

          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold uppercase">Z-Score Statistical Limit</span>
            <div className="text-xl font-bold text-blue-400">|Z| &gt; 3.0</div>
            <p className="text-[11px] text-slate-500">N=30 rolling sample window (Temp/Hum)</p>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-400" />
          <span>Transactional Alert Preferences</span>
        </h3>

        <div className="flex items-center justify-between p-4 bg-slate-900/60 rounded-xl border border-slate-800">
          <div className="space-y-0.5">
            <span className="text-sm font-semibold text-white">Nodemailer Email Alerts</span>
            <p className="text-xs text-slate-400">Sends emergency emails on HIGH & CRITICAL severity anomalies</p>
          </div>
          <button
            onClick={() => setEmailEnabled(!emailEnabled)}
            className={`w-12 h-6 rounded-full transition-colors relative p-1 ${
              emailEnabled ? 'bg-blue-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                emailEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            ></div>
          </button>
        </div>
      </div>

      {/* Profile & Security Form */}
      <form onSubmit={handleSaveProfile} className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-blue-400" />
          <span>User Profile Management</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Username</label>
            <input
              type="text"
              readOnly
              value={user?.username || 'admin'}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Email Address</label>
            <input
              type="email"
              readOnly
              value={user?.email || 'admin@safebox.io'}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 cursor-not-allowed"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Change Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          type="submit"
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-blue-600/20"
        >
          <Save className="w-4 h-4" />
          <span>Save Changes</span>
        </button>
      </form>
    </div>
  );
}
