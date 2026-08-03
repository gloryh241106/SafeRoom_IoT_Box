import React, { useState, useEffect } from 'react';
import { Thermometer, Droplets, Flame, Sun, Activity, Fan, Bell, ShieldAlert, ShieldCheck, CheckCircle } from 'lucide-react';

export default function Overview() {
  const [telemetry, setTelemetry] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [systemArmed, setSystemArmed] = useState(true);
  const [actuatorLoading, setActuatorLoading] = useState(false);

  // Fetch telemetry and anomalies
  const fetchData = async () => {
    try {
      const telRes = await fetch('/api/v1/telemetry/latest');
      const telJson = await telRes.json();
      if (telJson.success) {
        setTelemetry(telJson.data);
      }

      const anomRes = await fetch('/api/v1/anomalies?status=unresolved');
      const anomJson = await anomRes.json();
      if (anomJson.success) {
        setAnomalies(anomJson.data);
      }
    } catch (err) {
      console.error('Error polling telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Handle manual actuator toggle
  const handleActuatorToggle = async (actuator, currentState) => {
    setActuatorLoading(true);
    try {
      const targetState = !currentState;
      const res = await fetch('/api/v1/control/actuator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'safebox-01',
          actuator,
          state: targetState
        })
      });
      const json = await res.json();
      if (json.success) {
        if (actuator === 'systemArmed') {
          setSystemArmed(targetState);
        } else {
          setTelemetry((prev) => ({
            ...prev,
            actuatorStates: {
              ...prev.actuatorStates,
              [actuator === 'fan' ? 'fanOn' : actuator === 'buzzer' ? 'buzzerActive' : 'alertLedActive']: targetState
            }
          }));
        }
      }
    } catch (err) {
      console.error('Error toggling actuator:', err);
    } finally {
      setActuatorLoading(false);
    }
  };

  // Resolve anomaly
  const handleResolveAnomaly = async (id) => {
    try {
      const res = await fetch(`/api/v1/anomalies/${id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy: 'Admin User' })
      });
      const json = await res.json();
      if (json.success) {
        setAnomalies(anomalies.filter((a) => a._id !== id));
      }
    } catch (err) {
      console.error('Error resolving anomaly:', err);
    }
  };

  if (loading && !telemetry) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const metrics = telemetry?.metrics || { temperature: 0, humidity: 0, gasLevel: 0, lightIntensity: 0, motionDetected: false };
  const actuators = telemetry?.actuatorStates || { fanOn: false, buzzerActive: false, alertLedActive: false };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Overview Dashboard</h2>
          <p className="text-sm text-slate-400">Live environmental telemetry and remote actuator command center</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleActuatorToggle('systemArmed', systemArmed)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
              systemArmed
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 hover:bg-blue-600/30'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {systemArmed ? <ShieldCheck className="w-4 h-4 text-blue-400" /> : <ShieldAlert className="w-4 h-4 text-slate-400" />}
            <span>System Armed: {systemArmed ? 'ARMED' : 'DISARMED'}</span>
          </button>
        </div>
      </div>

      {/* Unresolved Anomalies Alert Banner */}
      {anomalies.length > 0 && (
        <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
            <Bell className="w-4 h-4 animate-bounce" />
            <span>Active Unresolved Anomalies ({anomalies.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {anomalies.map((anom) => (
              <div key={anom._id} className="bg-red-900/20 border border-red-500/20 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-300 uppercase">
                      {anom.severity}
                    </span>
                    <span className="text-xs font-medium text-slate-200 capitalize">{anom.sensorType} breach</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Observed: {String(anom.observedValue)} (Limit: {String(anom.thresholdLimit)})</p>
                </div>
                <button
                  onClick={() => handleResolveAnomaly(anom._id)}
                  className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg border border-emerald-500/30 transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Resolve</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Temperature Card */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Temperature</span>
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
              <Thermometer className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">{metrics.temperature}°C</div>
            <p className="text-xs text-slate-400 mt-1">DHT22 Digital Sensor</p>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-orange-500 h-full" style={{ width: `${Math.min(100, (metrics.temperature / 50) * 100)}%` }}></div>
          </div>
        </div>

        {/* Humidity Card */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Humidity</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Droplets className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">{metrics.humidity}%</div>
            <p className="text-xs text-slate-400 mt-1">Relative Room Moisture</p>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full" style={{ width: `${Math.min(100, metrics.humidity)}%` }}></div>
          </div>
        </div>

        {/* Gas Level Card */}
        <div className={`glass-card p-5 rounded-2xl border transition-all space-y-3 ${
          metrics.gasLevel > 600 ? 'border-red-500/50 bg-red-950/20' : 'border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Gas / Smoke</span>
            <div className={`p-2 rounded-xl ${metrics.gasLevel > 600 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
              <Flame className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">{metrics.gasLevel} <span className="text-sm font-normal text-slate-400">PPM</span></div>
            <p className="text-xs text-slate-400 mt-1">MQ2 Gas Sensor (Max 600)</p>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className={`h-full ${metrics.gasLevel > 600 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (metrics.gasLevel / 800) * 100)}%` }}></div>
          </div>
        </div>

        {/* Light Intensity Card */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Light Level</span>
            <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-400">
              <Sun className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">{metrics.lightIntensity} <span className="text-sm font-normal text-slate-400">LX</span></div>
            <p className="text-xs text-slate-400 mt-1">LDR Photoresistor</p>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-yellow-500 h-full" style={{ width: `${Math.min(100, (metrics.lightIntensity / 1024) * 100)}%` }}></div>
          </div>
        </div>

        {/* Motion Card */}
        <div className={`glass-card p-5 rounded-2xl border transition-all space-y-3 ${
          metrics.motionDetected ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Motion</span>
            <div className={`p-2 rounded-xl ${metrics.motionDetected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {metrics.motionDetected ? (
                <span className="text-emerald-400">ACTIVE</span>
              ) : (
                <span className="text-slate-400">CLEAR</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">PIR HC-SR501 Sensor</p>
          </div>
        </div>
      </div>

      {/* Remote Actuator Controls */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Fan className="w-5 h-5 text-blue-400" />
          <span>Remote Actuator Command Controls</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* DC Fan Toggle */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-sm font-semibold text-white">DC Fan Relay</span>
              <p className="text-xs text-slate-400">GPIO 16 (HIGH = ON)</p>
            </div>
            <button
              disabled={actuatorLoading}
              onClick={() => handleActuatorToggle('fan', actuators.fanOn)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                actuators.fanOn
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {actuators.fanOn ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Buzzer Toggle */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-sm font-semibold text-white">Active Buzzer Alarm</span>
              <p className="text-xs text-slate-400">GPIO 19 PWM LEDC</p>
            </div>
            <button
              disabled={actuatorLoading}
              onClick={() => handleActuatorToggle('buzzer', actuators.buzzerActive)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                actuators.buzzerActive
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {actuators.buzzerActive ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          {/* Alert LED Toggle */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-sm font-semibold text-white">Alert LED (Red)</span>
              <p className="text-xs text-slate-400">GPIO 18 Digital Output</p>
            </div>
            <button
              disabled={actuatorLoading}
              onClick={() => handleActuatorToggle('alertLed', actuators.alertLedActive)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                actuators.alertLedActive
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {actuators.alertLedActive ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
