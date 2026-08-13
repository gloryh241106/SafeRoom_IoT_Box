const { SensorReading } = require('../models/Schemas');
const { processTelemetryForAnomalies } = require('./anomalyEngine');

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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
  const normalizedMetrics = {
    temperature: requireFiniteNumber(metrics.temperature, 'metrics.temperature', { min: -40, max: 85 }),
    humidity: requireFiniteNumber(metrics.humidity, 'metrics.humidity', { min: 0, max: 100 }),
    gasLevel: requireFiniteNumber(metrics.gasLevel, 'metrics.gasLevel', { min: 0, max: 100000 }),
    gasValid: metrics.gasValid === undefined
      ? true
      : requireBoolean(metrics.gasValid, 'metrics.gasValid'),
    gasUnit: metrics.gasUnit === undefined ? 'adc_index' : metrics.gasUnit,
    motionDetected: requireBoolean(metrics.motionDetected, 'metrics.motionDetected')
  };

  if (normalizedMetrics.gasUnit !== 'adc_index') {
    throw new TypeError("metrics.gasUnit must be 'adc_index'");
  }
  if (metrics.gasRaw !== undefined && metrics.gasRaw !== null) {
    normalizedMetrics.gasRaw = requireFiniteNumber(metrics.gasRaw, 'metrics.gasRaw', { min: 0, max: 4095 });
  }

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
    }
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
  ingestTelemetry,
  validateTelemetryPayload
};
