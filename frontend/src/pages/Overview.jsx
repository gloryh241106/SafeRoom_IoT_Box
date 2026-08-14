/**
 * Live operations page for one Safebox device.
 *
 * Sensor values come from persisted ESP32 telemetry, while broker/LWT state is
 * queried separately. Actuator changes are optimistic commands and are later
 * reconciled by the next device-authored telemetry snapshot.
 */
import React, { useState, useEffect } from 'react';
import { Thermometer, Droplets, Flame, Activity, Fan, Bell, ShieldAlert, ShieldCheck, CheckCheck } from 'lucide-react';
import { apiFetch } from '../api';
import {
  DEFAULT_GAS_ALERT_THRESHOLD,
  FIRMWARE_EDGE_GAS_THRESHOLD,
  MQ2_ADC_MAX,
  MQ2_ADC_MIN,
  formatMetric,
  getRawGasValue,
  hasValidRawGasValue,
  rawGasProgressPercent
} from '../telemetryContract';

const ACTUATOR_STATE_FIELDS = {
  fan: 'fanOn'
};

export default function Overview() {
  const [telemetry, setTelemetry] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [systemArmed, setSystemArmed] = useState(true);
  const [pendingActuator, setPendingActuator] = useState(null);
  const [connectionState, setConnectionState] = useState('connecting');
  const [controlFeedback, setControlFeedback] = useState(null);
  const [hardwareMode, setHardwareMode] = useState('unknown');
  const [gasThreshold, setGasThreshold] = useState(DEFAULT_GAS_ALERT_THRESHOLD);
  const [firmwareGasThreshold, setFirmwareGasThreshold] = useState(FIRMWARE_EDGE_GAS_THRESHOLD);

  // A successful telemetry read alone does not prove that the MQTT device is
  // online, so the control status/LWT response participates in connection state.
  const fetchData = async () => {
    try {
      const telRes = await apiFetch('/api/v1/telemetry/latest');
      const telJson = await telRes.json();
      if (!telRes.ok || !telJson.success) throw new Error(telJson.error || 'Telemetry request failed');
      setTelemetry(telJson.data);

      const statusRes = await apiFetch(`/api/v1/control/status?deviceId=${encodeURIComponent(telJson.data.deviceId)}`);
      const statusJson = await statusRes.json();
      if (!statusRes.ok || !statusJson.success) throw new Error(statusJson.error || 'Device status request failed');

      const anomRes = await apiFetch('/api/v1/anomalies?status=unresolved');
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
    let active = true;

    // Backend anomaly thresholds are runtime configuration. Failure to load
    // them must not stop live telemetry, so the documented fallback remains.
    const fetchBackendGasThreshold = async () => {
      try {
        const res = await apiFetch('/api/v1/control/thresholds');
const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Threshold request failed');
        if (active && Number.isFinite(json.data?.gasMax)) setGasThreshold(json.data.gasMax);
        if (active && Number.isFinite(json.data?.firmwareGasEdgeThreshold)) {
          setFirmwareGasThreshold(json.data.firmwareGasEdgeThreshold);
        }
      } catch (error) {
        console.warn('Using fallback gas threshold:', error.message);
      }
    };

    fetchBackendGasThreshold();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    fetchData();
    // Three seconds stays inside the project's 2-5 second REST polling baseline.
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Apply the requested state immediately for responsive controls. The next
  // telemetry poll replaces it with the state reported by the physical device.
  const handleActuatorToggle = async (actuator, currentState) => {
    setPendingActuator(actuator);
    setControlFeedback(null);
    try {
      const targetState = !currentState;
      const res = await apiFetch('/api/v1/control/actuator', {
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
        const stateField = ACTUATOR_STATE_FIELDS[actuator];
        if (!stateField) throw new Error(`Unsupported actuator '${actuator}'`);
        setTelemetry((prev) => ({
          ...(prev || {}),
          actuatorStates: {
            ...(prev?.actuatorStates || {}),
            [stateField]: targetState
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

  // The endpoint preserves audit history: "clear" resolves records instead of
  // deleting them from MongoDB, even though this view removes them immediately.
  const handleDeleteAllAnomalies = async () => {
    try {
      const res = await apiFetch('/api/v1/anomalies/clear-all', {
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

  if (!telemetry) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Overview Dashboard</h2>
          <p className="text-sm text-slate-500">Live environmental telemetry and remote actuator command center</p>
        </div>
        <div className="glass-card rounded-lg p-8 text-center space-y-3" role="status">
          <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-950">No telemetry received</h3>
          <p className="text-sm text-slate-600 max-w-xl mx-auto">
            SafeboxManager has no ESP32 sensor reading to display. Check the device and MQTT connection, then retry.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md transition-colors"
          >
            Retry telemetry
          </button>
        </div>
      </div>
    );
  }

const metrics = telemetry.metrics;
  const actuators = telemetry.actuatorStates;
  const rawGasValue = getRawGasValue(metrics);
  const gasValid = hasValidRawGasValue(metrics);
const gasAlarm = gasValid && rawGasValue > gasThreshold;
  // The device reports the threshold actually in force; fall back to config.h
  // when telemetry predates this field (e.g. legacy firmware still flashed).
  const deviceGasAlarmThreshold = Number.isFinite(metrics.gasAlarmThreshold) && metrics.gasAlarmThreshold > 0
    ? metrics.gasAlarmThreshold
    : null;
  const edgeThreshold = deviceGasAlarmThreshold ?? firmwareGasThreshold;
  const edgeSourceLabel = deviceGasAlarmThreshold ? 'device live' : 'config.h (not reported)';
  const hardwareModeLabel = hardwareMode === 'mock'
    ? 'Simulation'
    : hardwareMode === 'connected'
      ? 'MQTT live'
      : 'MQTT unavailable';

  return (
    <div className="space-y-6">
      {/* Connection health combines backend reachability with MQTT/LWT state. */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Overview Dashboard</h2>
          <p className="text-sm text-slate-500">Live environmental telemetry and remote actuator command center</p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Formatting below is presentation-only; telemetry state stays untouched. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-lg space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Temperature</span>
            <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
              <Thermometer className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-950">{formatMetric(metrics.temperature)}°C</div>
            <p className="text-xs text-slate-500 mt-1">DHT22 Digital Sensor</p>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-orange-500 h-full" style={{ width: `${Math.min(100, (metrics.temperature / 50) * 100)}%` }}></div>
          </div>
        </div>

        <div className="glass-card p-5 rounded-lg space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Humidity</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Droplets className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-950">{formatMetric(metrics.humidity)}%</div>
            <p className="text-xs text-slate-500 mt-1">Relative Room Moisture</p>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full" style={{ width: `${Math.min(100, metrics.humidity)}%` }}></div>
          </div>
        </div>

        {/* MQ-2 stays a raw 12-bit ADC count; no PPM conversion is implied. */}
        <div className={`glass-card p-5 rounded-lg border transition-colors space-y-3 ${
          gasAlarm ? 'border-red-300 !bg-red-50' : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Gas / Smoke</span>
            <div className={`p-2 rounded-lg ${gasAlarm ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
              <Flame className="w-5 h-5" />
            </div>
          </div>
          <div>
            {gasValid ? (
              <div className="text-3xl font-bold text-slate-950">{rawGasValue} <span className="text-sm font-normal text-slate-500">raw ADC</span></div>
            ) : (
              <div className="text-xl font-bold text-amber-600">INVALID READING</div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              MQ-2 12-bit range {MQ2_ADC_MIN}–{MQ2_ADC_MAX}
</p>
<p className="text-[11px] text-slate-500 mt-1">
              Backend alarm &gt; {gasThreshold} · ESP32 edge &gt; {edgeThreshold} ({edgeSourceLabel})
            </p>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className={`h-full ${gasAlarm ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${gasValid ? rawGasProgressPercent(rawGasValue) : 0}%` }}></div>
          </div>
        </div>

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

      {/* Commands are optimistic; telemetry remains authoritative after publish. */}
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
<div className="grid grid-cols-1 gap-4">
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
        </div>
      </div>

      {/* Clearing resolves records server-side so the historical audit trail remains. */}
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
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Resolve All</span>
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
