const { SensorReading } = require('../models/Schemas');
const { processTelemetryForAnomalies } = require('./anomalyEngine');

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const GAS_SENSOR_STATES = new Set(['burn_in', 'warming_up', 'calibrating', 'ready', 'fault']);

function requireObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${fieldName} must be an object`);
  }
  return value;
}

function requireFiniteNumber(value, fieldName, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${fieldName} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function requireBoolean(value, fieldName) {
  if (typeof value !== 'boolean') throw new TypeError(`${fieldName} must be a boolean`);
  return value;
}

function optionalFiniteNumber(value, fieldName, options) {
  if (value === undefined || value === null) return null;
  return requireFiniteNumber(value, fieldName, options);
}

function normalizeGasSensorStatus(payloadStatus, gasLevel) {
  // Legacy firmware/mock payloads predate sensorStatus and always provide PPM.
  if (payloadStatus === undefined || payloadStatus === null) {
    if (!Number.isFinite(gasLevel)) {
      throw new TypeError('metrics.gasLevel must be a finite number for legacy telemetry');
    }
    return { state: 'ready', ready: true };
  }

  const status = requireObject(payloadStatus, 'sensorStatus');
  const gas = requireObject(status.gas, 'sensorStatus.gas');
  if (!GAS_SENSOR_STATES.has(gas.state)) {
    throw new TypeError(`sensorStatus.gas.state must be one of ${[...GAS_SENSOR_STATES].join(', ')}`);
  }
  const ready = requireBoolean(gas.ready, 'sensorStatus.gas.ready');
  if (ready !== (gas.state === 'ready')) {
    throw new TypeError('sensorStatus.gas.ready must match state=ready');
  }
  if (ready && !Number.isFinite(gasLevel)) {
    throw new TypeError('metrics.gasLevel must be a finite number when the gas sensor is ready');
  }
  if (!ready && gasLevel !== null && gasLevel !== undefined) {
    throw new TypeError('metrics.gasLevel must be null while the gas sensor is not ready');
  }

  return {
    state: gas.state,
    ready,
    adcRaw: optionalFiniteNumber(gas.adcRaw, 'sensorStatus.gas.adcRaw', { min: 0, max: 4095 }),
    adcMillivolts: optionalFiniteNumber(
      gas.adcMillivolts,
      'sensorStatus.gas.adcMillivolts',
      { min: 0, max: 3300 }
    ),
    sourceMillivolts: optionalFiniteNumber(
      gas.sourceMillivolts,
      'sensorStatus.gas.sourceMillivolts',
      { min: 0, max: 5500 }
    ),
    burnInRemainingSeconds: optionalFiniteNumber(
      gas.burnInRemainingSeconds,
      'sensorStatus.gas.burnInRemainingSeconds',
      { min: 0, max: 7 * 24 * 60 * 60 }
    ) ?? 0,
    roOhms: optionalFiniteNumber(gas.roOhms, 'sensorStatus.gas.roOhms', { min: 0, max: 1_000_000 }),
    rsRoRatio: optionalFiniteNumber(gas.rsRoRatio, 'sensorStatus.gas.rsRoRatio', { min: 0, max: 1000 })
  };
}

function normalizeTimestamp(value) {
  const timestamp = value === undefined || value === null ? new Date() : new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('timestamp must be a valid date');
  return timestamp;
}

function validateTelemetryPayload(payload, expectedDeviceId) {
  requireObject(payload, 'telemetry payload');
  const deviceId = payload.deviceId || expectedDeviceId;

  if (!deviceId || !DEVICE_ID_PATTERN.test(deviceId)) {
    throw new TypeError('deviceId must contain only letters, numbers, underscores, or hyphens');
  }
  if (expectedDeviceId && deviceId !== expectedDeviceId) {
    throw new TypeError(`payload deviceId '${deviceId}' does not match MQTT topic device '${expectedDeviceId}'`);
  }

  const metrics = requireObject(payload.metrics, 'metrics');
  const actuatorStates = requireObject(payload.actuatorStates, 'actuatorStates');
  const gasLevel = metrics.gasLevel === null || metrics.gasLevel === undefined
    ? null
    : requireFiniteNumber(metrics.gasLevel, 'metrics.gasLevel', { min: 0, max: 100000 });
  const gasSensorStatus = normalizeGasSensorStatus(payload.sensorStatus, gasLevel);
  const normalizedMetrics = {
    temperature: requireFiniteNumber(metrics.temperature, 'metrics.temperature', { min: -40, max: 85 }),
    humidity: requireFiniteNumber(metrics.humidity, 'metrics.humidity', { min: 0, max: 100 }),
    gasLevel,
    motionDetected: requireBoolean(metrics.motionDetected, 'metrics.motionDetected')
  };

  if (metrics.lightIntensity !== undefined && metrics.lightIntensity !== null) {
    normalizedMetrics.lightIntensity = requireFiniteNumber(
      metrics.lightIntensity,
      'metrics.lightIntensity',
      { min: 0, max: 100000 }
    );
  }

  return {
    timestamp: normalizeTimestamp(payload.timestamp),
    deviceId,
    metrics: normalizedMetrics,
    actuatorStates: {
      fanOn: requireBoolean(actuatorStates.fanOn, 'actuatorStates.fanOn'),
      buzzerActive: requireBoolean(actuatorStates.buzzerActive, 'actuatorStates.buzzerActive'),
      alertLedActive: requireBoolean(actuatorStates.alertLedActive, 'actuatorStates.alertLedActive')
    },
    sensorStatus: { gas: gasSensorStatus }
  };
}

async function ingestTelemetry(payload, expectedDeviceId) {
  const normalized = validateTelemetryPayload(payload, expectedDeviceId);
  const reading = await SensorReading.create(normalized);
  const anomalies = await processTelemetryForAnomalies(reading);
  return { reading, anomalies };
}

module.exports = {
  DEVICE_ID_PATTERN,
  GAS_SENSOR_STATES,
  ingestTelemetry,
  validateTelemetryPayload
};
