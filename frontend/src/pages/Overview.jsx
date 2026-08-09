import React, { useState, useEffect } from 'react';
import { Thermometer, Droplets, Flame, Activity, Fan, Bell, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';

export default function Overview() {
  const [telemetry, setTelemetry] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [systemArmed, setSystemArmed] = useState(true);
  const [pendingActuator, setPendingActuator] = useState(null);
  const [connectionState, setConnectionState] = useState('connecting');
  const [controlFeedback, setControlFeedback] = useState(null);
  const [hardwareMode, setHardwareMode] = useState('unknown');

  // Fetch telemetry and anomalies
  const fetchData = async () => {
    try {
      const telRes = await fetch('/api/v1/telemetry/latest');
      const telJson = await telRes.json();
      if (!telRes.ok || !telJson.success) throw new Error(telJson.error || 'Telemetry request failed');
      setTelemetry(telJson.data);

      const statusRes = await fetch(`/api/v1/control/status?deviceId=${encodeURIComponent(telJson.data.deviceId)}`);
      const statusJson = await statusRes.json();
      if (!statusRes.ok || !statusJson.success) throw new Error(statusJson.error || 'Device status request failed');

      const anomRes = await fetch('/api/v1/anomalies?status=unresolved');
      const anomJson = await anomRes.json();
      if (anomJson.success) {
        setAnomalies(anomJson.data);
      }
      const mqtt = statusJson.mqtt;
      const deviceOnline = mqtt.mode === 'mock' || (mqtt.brokerConnected && mqtt.device?.status === 'online');
      setSystemArmed(Boolean(statusJson.systemArmed));
      setHardwareMode(mqtt.mode);
      setConnectionState(deviceOnline ? 'online' : 'degraded');
    } catch (err) {
      console.error('Error polling telemetry:', err);
      setHardwareMode('unknown');
      setConnectionState('offline');
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
    setPendingActuator(actuator);
    setControlFeedback(null);
    try {
      const targetState = !currentState;
      const res = await fetch('/api/v1/control/actuator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: telemetry?.deviceId || 'safebox-01',
          actuator,
          state: targetState
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Control command failed');

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
      const successMessage = actuator === 'systemArmed'
        ? 'System state updated'
        : json.delivery === 'mocked'
          ? 'Simulation updated'
          : 'Command published';
      setControlFeedback({ type: 'success', message: successMessage });
    } catch (err) {
      console.error('Error toggling actuator:', err);
      setControlFeedback({ type: 'error', message: err.message });
    } finally {
      setPendingActuator(null);
    }
  };

  // Delete all unresolved anomalies from view and backend
  const handleDeleteAllAnomalies = async () => {
    try {
      const res = await fetch('/api/v1/anomalies/clear-all', {
        method: 'DELETE'
      });
      const json = await res.json();
      if (json.success) {
        setAnomalies([]);
      }
    } catch (err) {
      console.error('Error clearing anomalies:', err);
      setAnomalies([]);
    }
  };

  if (loading && !telemetry) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const metrics = telemetry?.metrics || { temperature: 0, humidity: 0, gasLevel: 0, motionDetected: false };
  const actuators = telemetry?.actuatorStates || { fanOn: false, buzzerActive: false, alertLedActive: false };
  const connectionLabel = connectionState === 'connecting'
    ? 'Connecting'
    : connectionState === 'online'
      ? 'Live'
      : connectionState === 'degraded'
        ? 'Device offline'
        : 'Disconnected';
  const connectionColor = connectionState === 'online'
    ? 'bg-emerald-400'
    : connectionState === 'connecting'
      ? 'bg-amber-400'
      : 'bg-red-400';
  const hardwareModeLabel = hardwareMode === 'mock'
    ? 'Simulation'
    : hardwareMode === 'connected'
      ? 'MQTT live'
      : 'MQTT unavailable';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Overview Dashboard</h2>
          <p className="text-sm text-slate-500">Live environmental telemetry and remote actuator command center</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700" aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full ${connectionColor}`} />
            {connectionLabel}
          </div>
          <button
            disabled={pendingActuator !== null}
            onClick={() => handleActuatorToggle('systemArmed', systemArmed)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
              systemArmed
                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
            }`}
          >
            {systemArmed ? <ShieldCheck className="w-4 h-4 text-blue-600" /> : <ShieldAlert className="w-4 h-4 text-slate-500" />}
            <span>System Armed: {systemArmed ? 'ARMED' : 'DISARMED'}</span>
          </button>
        </div>
      </div>

      {/* Live Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Temperature Card */}
        <div className="glass-card p-5 rounded-lg space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Temperature</span>
            <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
              <Thermometer className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-950">{metrics.temperature}°C</div>
            <p className="text-xs text-slate-500 mt-1">DHT22 Digital Sensor</p>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-orange-500 h-full" style={{ width: `${Math.min(100, (metrics.temperature / 50) * 100)}%` }}></div>
          </div>
        </div>

        {/* Humidity Card */}
        <div className="glass-card p-5 rounded-lg space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Humidity</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Droplets className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-950">{metrics.humidity}%</div>
            <p className="text-xs text-slate-500 mt-1">Relative Room Moisture</p>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full" style={{ width: `${Math.min(100, metrics.humidity)}%` }}></div>
          </div>
        </div>

        {/* Gas Level Card */}
        <div className={`glass-card p-5 rounded-lg border transition-colors space-y-3 ${
          metrics.gasLevel > 600 ? 'border-red-300 !bg-red-50' : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Gas / Smoke</span>
            <div className={`p-2 rounded-lg ${metrics.gasLevel > 600 ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
              <Flame className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-950">{metrics.gasLevel} <span className="text-sm font-normal text-slate-500">PPM</span></div>
            <p className="text-xs text-slate-500 mt-1">MQ2 Gas Sensor (Max 600)</p>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className={`h-full ${metrics.gasLevel > 600 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (metrics.gasLevel / 800) * 100)}%` }}></div>
          </div>
        </div>

        {/* Motion Card */}
        <div className={`glass-card p-5 rounded-lg border transition-colors space-y-3 ${
          metrics.motionDetected ? 'border-emerald-300 !bg-emerald-50' : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Motion</span>
            <div className={`p-2 rounded-lg ${metrics.motionDetected ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-950">
              {metrics.motionDetected ? (
                <span className="text-emerald-600">ACTIVE</span>
              ) : (
                <span className="text-slate-500">CLEAR</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">PIR HC-SR501 Sensor</p>
          </div>
        </div>
      </div>

      {/* Remote Actuator Controls */}
      <div className="glass-card p-6 rounded-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-950 flex items-center gap-2">
            <Fan className="w-5 h-5 text-blue-600" />
            <span>Remote Actuator Command Controls</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              hardwareMode === 'mock'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : hardwareMode === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {hardwareModeLabel}
            </span>
            {controlFeedback && (
              <p className={`text-xs font-semibold ${controlFeedback.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                {controlFeedback.message}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* DC Fan Toggle */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-sm font-semibold text-slate-950">CB-03 | DC Fan Relay</span>
              <p className="text-xs text-slate-500">GPIO 16 (relay, active-low)</p>
            </div>
            <button
              disabled={pendingActuator !== null || connectionState !== 'online'}
              onClick={() => handleActuatorToggle('fan', actuators.fanOn)}
              className={`min-w-20 px-4 py-2 rounded-md text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                actuators.fanOn
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              {pendingActuator === 'fan' ? 'SENDING' : actuators.fanOn ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Buzzer Toggle */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-sm font-semibold text-slate-950">Active Buzzer Alarm</span>
              <p className="text-xs text-slate-500">GPIO 19 PWM LEDC</p>
            </div>
            <button
              disabled={pendingActuator !== null || connectionState !== 'online'}
              onClick={() => handleActuatorToggle('buzzer', actuators.buzzerActive)}
              className={`min-w-20 px-4 py-2 rounded-md text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                actuators.buzzerActive
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              {pendingActuator === 'buzzer' ? 'SENDING' : actuators.buzzerActive ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          {/* Alert LED Toggle */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-sm font-semibold text-slate-950">Alert LED (Red)</span>
              <p className="text-xs text-slate-500">GPIO 18 Digital Output</p>
            </div>
            <button
              disabled={pendingActuator !== null || connectionState !== 'online'}
              onClick={() => handleActuatorToggle('alertLed', actuators.alertLedActive)}
              className={`min-w-20 px-4 py-2 rounded-md text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                actuators.alertLedActive
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              {pendingActuator === 'alertLed' ? 'SENDING' : actuators.alertLedActive ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* Active Unresolved Anomalies Table / Panel */}
      {anomalies.length > 0 && (
        <div className="glass-card rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-950 font-bold text-sm">
              <Bell className="w-4 h-4 text-red-600 animate-bounce" />
              <span>Active Unresolved Anomalies ({anomalies.length})</span>
            </div>
            <button
              onClick={handleDeleteAllAnomalies}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-md text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {anomalies.map((anom) => {
              const isHighOrCritical = anom.severity === 'HIGH' || anom.severity === 'CRITICAL';
              return (
                <div
                  key={anom._id}
                  className={`p-4 rounded-lg flex items-center justify-between border transition-colors ${
                    isHighOrCritical
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                          isHighOrCritical
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : anom.severity === 'MEDIUM'
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : 'bg-blue-100 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {anom.severity}
                      </span>
                      <span className="text-xs font-semibold capitalize">{anom.sensorType} breach</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">Observed: {String(anom.observedValue)} (Limit: {String(anom.thresholdLimit)})</p>
                    <p className="text-[10px] text-slate-500">{new Date(anom.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
