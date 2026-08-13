import React, { useState, useEffect } from 'react';
import { User, Bell, Shield, Save, CheckCircle, Cpu } from 'lucide-react';
import { apiFetch } from '../api';

export default function Settings({ user }) {
  const [emailEnabled, setEmailEnabled] = useState(user?.settings?.emailEnabled ?? true);
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  
  // Editable Safety Thresholds State
  const [thresholds, setThresholds] = useState({
    gasMax: 600,
    tempMax: 45,
    tempMin: 10,
    humidityMax: 85,
    humidityMin: 20,
    zScoreLimit: 3.0,
    isAutomatic: false
  });
  const [thresholdLoading, setThresholdLoading] = useState(false);

  // Fetch initial thresholds from backend
  useEffect(() => {
    apiFetch('/api/v1/control/thresholds')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setThresholds((prev) => ({ ...prev, ...json.data }));
        }
      })
      .catch((err) => console.error('Error fetching safety thresholds:', err));
  }, []);

  useEffect(() => {
    let active = true;
    setProfileLoading(true);
    apiFetch('/api/v1/users/profile')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Unable to load profile settings');
        if (!active) return;
        const profile = json.data;
        setEmailEnabled(profile.settings?.emailEnabled ?? true);
        setProfileEmail(profile.email || '');
      })
      .catch((error) => {
        if (active) setSaveError(error.message);
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.email]);

  const saveProfileChanges = async (payload, successMessage) => {
    setProfileSaving(true);
    setSaveError('');
    try {
      const res = await apiFetch('/api/v1/users/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Unable to save profile settings');
      setSavedMessage(successMessage);
      setTimeout(() => setSavedMessage(''), 3000);
      return json.data;
    } catch (error) {
      setSaveError(error.message);
      return null;
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveThresholds = async (e) => {
    e.preventDefault();
    setThresholdLoading(true);
    try {
      const res = await apiFetch('/api/v1/control/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds)
      });
      const json = await res.json();
      if (json.success) {
        setSavedMessage('Safety thresholds & anomaly mode updated successfully!');
        setTimeout(() => setSavedMessage(''), 3000);
      }
    } catch (err) {
      console.error('Error saving safety thresholds:', err);
    } finally {
      setThresholdLoading(false);
    }
  };

  const handleSaveNotifications = async (e) => {
    e.preventDefault();
    await saveProfileChanges({
      settings: {
        emailEnabled
      }
    }, 'Email alert settings updated successfully!');
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!password) {
      setSaveError('Enter a new password before saving profile security settings.');
      return;
    }
    const updated = await saveProfileChanges(
      { newPassword: password },
      'Password updated successfully!'
    );
    if (updated) setPassword('');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Settings & Safety Matrix</h2>
        <p className="text-sm text-slate-500">Account profiles, notification preferences, and editable safety thresholds</p>
      </div>

      {savedMessage && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>{savedMessage}</span>
        </div>
      )}

      {saveError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {saveError}
        </div>
      )}

      {/* Editable Safety Rule Matrix Form */}
      <form onSubmit={handleSaveThresholds} className="glass-card p-6 rounded-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <span>Authoritative System Safety Threshold Matrix</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">Configure live safety limits enforced by backend anomaly engine and hardware safety triggers</p>
          </div>
          <button
            type="submit"
            disabled={thresholdLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-md transition-colors shrink-0"
          >
            <Save className="w-4 h-4" />
            <span>Save Thresholds</span>
          </button>
        </div>

        {/* Automatic Mode Toggle Switch */}
        <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold text-slate-950">Automatic Mode (Z-Score Engine)</span>
            </div>
            <p className="text-xs text-slate-500">
              {thresholds.isAutomatic
                ? 'ON: Continuous metrics (Temp & Humidity) use statistical Z-Score anomaly engine (|Z| > threshold limit).'
                : 'OFF: Continuous metrics use static manual upper and lower bound limits.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setThresholds({ ...thresholds, isAutomatic: !thresholds.isAutomatic })}
            className={`w-12 h-6 rounded-full transition-colors relative p-1 shrink-0 ${
              thresholds.isAutomatic ? 'bg-violet-600' : 'bg-slate-300'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                thresholds.isAutomatic ? 'translate-x-6' : 'translate-x-0'
              }`}
            ></div>
          </button>
        </div>

        {/* Grid of Threshold Input Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {/* MQ2 Gas Threshold (Always Active Safety Bound) */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
            <label className="block text-xs text-slate-600 font-semibold uppercase">MQ-2 Gas Index Max (ADC)</label>
            <input
              type="number"
              value={thresholds.gasMax}
              onChange={(e) => setThresholds({ ...thresholds, gasMax: Number(e.target.value) })}
              className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-base font-bold text-red-600 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            <p className="text-[11px] text-slate-500">Triggers Local Buzzer + Red LED + Email</p>
          </div>

          {/* Temperature Max Bound */}
          <div className={`bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 transition-opacity ${
            thresholds.isAutomatic ? 'opacity-50 cursor-not-allowed' : ''
          }`}>
            <div className="flex items-center justify-between">
              <label className="block text-xs text-slate-600 font-semibold uppercase">Temp Max Bound (°C)</label>
              {thresholds.isAutomatic && <span className="text-[10px] text-violet-600 font-medium">Disabled (Auto Mode)</span>}
            </div>
            <input
              type="number"
              step="0.5"
              disabled={thresholds.isAutomatic}
              value={thresholds.tempMax}
              onChange={(e) => setThresholds({ ...thresholds, tempMax: Number(e.target.value) })}
              className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-base font-bold text-orange-600 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-slate-500">Manual upper limit (Fan + Email)</p>
          </div>

          {/* Temperature Min Bound */}
          <div className={`bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 transition-opacity ${
            thresholds.isAutomatic ? 'opacity-50 cursor-not-allowed' : ''
          }`}>
            <div className="flex items-center justify-between">
              <label className="block text-xs text-slate-600 font-semibold uppercase">Temp Min Bound (°C)</label>
              {thresholds.isAutomatic && <span className="text-[10px] text-violet-600 font-medium">Disabled (Auto Mode)</span>}
            </div>
            <input
              type="number"
              step="0.5"
              disabled={thresholds.isAutomatic}
              value={thresholds.tempMin}
              onChange={(e) => setThresholds({ ...thresholds, tempMin: Number(e.target.value) })}
              className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-base font-bold text-orange-600 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-slate-500">Manual lower limit alert</p>
          </div>

          {/* Humidity Max Bound */}
          <div className={`bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 transition-opacity ${
            thresholds.isAutomatic ? 'opacity-50 cursor-not-allowed' : ''
          }`}>
            <div className="flex items-center justify-between">
              <label className="block text-xs text-slate-600 font-semibold uppercase">Humidity Max Bound (%)</label>
              {thresholds.isAutomatic && <span className="text-[10px] text-violet-600 font-medium">Disabled (Auto Mode)</span>}
            </div>
            <input
              type="number"
              step="1"
              disabled={thresholds.isAutomatic}
              value={thresholds.humidityMax}
              onChange={(e) => setThresholds({ ...thresholds, humidityMax: Number(e.target.value) })}
              className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-base font-bold text-blue-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-slate-500">Manual upper moisture limit</p>
          </div>

          {/* Humidity Min Bound */}
          <div className={`bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 transition-opacity ${
            thresholds.isAutomatic ? 'opacity-50 cursor-not-allowed' : ''
          }`}>
            <div className="flex items-center justify-between">
              <label className="block text-xs text-slate-600 font-semibold uppercase">Humidity Min Bound (%)</label>
              {thresholds.isAutomatic && <span className="text-[10px] text-violet-600 font-medium">Disabled (Auto Mode)</span>}
            </div>
            <input
              type="number"
              step="1"
              disabled={thresholds.isAutomatic}
              value={thresholds.humidityMin}
              onChange={(e) => setThresholds({ ...thresholds, humidityMin: Number(e.target.value) })}
              className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-base font-bold text-blue-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-slate-500">Manual lower moisture limit</p>
          </div>

          {/* Z-Score Limit */}
          <div className={`bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 transition-opacity ${
            !thresholds.isAutomatic ? 'opacity-50 cursor-not-allowed' : ''
          }`}>
            <div className="flex items-center justify-between">
              <label className="block text-xs text-slate-600 font-semibold uppercase">Z-Score Limit (|Z|)</label>
              {!thresholds.isAutomatic && <span className="text-[10px] text-slate-500 font-medium">Disabled (Manual Mode)</span>}
            </div>
            <input
              type="number"
              step="0.1"
              disabled={!thresholds.isAutomatic}
              value={thresholds.zScoreLimit}
              onChange={(e) => setThresholds({ ...thresholds, zScoreLimit: Number(e.target.value) })}
              className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-base font-bold text-violet-600 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed"
            />
            <p className="text-[11px] text-slate-500">N=30 rolling window limit in Auto mode</p>
          </div>
        </div>
      </form>

      {/* Notification Preferences */}
      <form onSubmit={handleSaveNotifications} className="glass-card p-6 rounded-lg space-y-4">
        <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-600" />
          <span>Transactional Alert Preferences</span>
        </h3>

        <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="space-y-0.5">
            <span className="text-sm font-semibold text-slate-950">Nodemailer Email Alerts</span>
            <p className="text-xs text-slate-500">Sends emergency emails on HIGH & CRITICAL severity anomalies</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={emailEnabled}
            aria-label="Enable anomaly email alerts"
            onClick={() => setEmailEnabled(!emailEnabled)}
            disabled={profileLoading || profileSaving}
            className={`w-12 h-6 rounded-full transition-colors relative p-1 ${
              emailEnabled ? 'bg-blue-600' : 'bg-slate-300'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                emailEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            ></div>
          </button>
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs font-semibold text-blue-700 uppercase">Alert recipient</p>
          <p className="text-sm font-semibold text-slate-950 mt-1 break-all">{profileEmail}</p>
          <p className="text-xs text-slate-500 mt-1">This is the email address registered in the user profile.</p>
        </div>

        <button
          type="submit"
          disabled={profileLoading || profileSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          <span>{profileSaving ? 'Saving...' : 'Save Email Settings'}</span>
        </button>
      </form>

      {/* Profile & Security Form */}
      <form onSubmit={handleSaveProfile} className="glass-card p-6 rounded-lg space-y-4">
        <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-600" />
          <span>User Profile Management</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Username</label>
            <input
              type="text"
              readOnly
              value={user?.username || 'admin'}
              className="w-full bg-slate-100 border border-slate-200 rounded-md px-4 py-2.5 text-sm text-slate-600 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
            <input
              type="email"
              readOnly
              value={user?.email || 'admin@safebox.io'}
              className="w-full bg-slate-100 border border-slate-200 rounded-md px-4 py-2.5 text-sm text-slate-600 cursor-not-allowed"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Change Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password..."
            className="w-full bg-white border border-slate-300 rounded-md px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <button
          type="submit"
          disabled={profileSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          <span>{profileSaving ? 'Saving...' : 'Update Password'}</span>
        </button>
      </form>
    </div>
  );
}
