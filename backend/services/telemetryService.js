/**
 * Boundary service for untrusted MQTT telemetry. It validates and normalizes a
 * complete device snapshot before any database write or anomaly side effect.
 */
const { SensorReading } = require('../models/Schemas');
const { processTelemetryForAnomalies } = require('./anomalyEngine');
const { MQ2_ADC_MAX, MQ2_ADC_MIN, MQ2_UNIT } = require('../config/sensorContract');

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

function requireInteger(value, fieldName, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${fieldName} must be an integer between ${min} and ${max}`);
  }
  return value;
}

/**
 * Converts a decoded MQTT object into the exact MongoDB document shape.
 * expectedDeviceId comes from the topic and prevents a payload from claiming
 * another device identity while being published on an authorized topic.
 */
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
    gasLevel: requireInteger(metrics.gasLevel, 'metrics.gasLevel', {
      min: MQ2_ADC_MIN,
      max: MQ2_ADC_MAX
    }),
    gasValid: metrics.gasValid === undefined
      ? true
      : requireBoolean(metrics.gasValid, 'metrics.gasValid'),
    gasUnit: metrics.gasUnit === undefined ? MQ2_UNIT : metrics.gasUnit,
    motionDetected: requireBoolean(metrics.motionDetected, 'metrics.motionDetected')
  };

  if (normalizedMetrics.gasUnit !== MQ2_UNIT) {
    throw new TypeError(`metrics.gasUnit must be '${MQ2_UNIT}'`);
  }
  if (metrics.gasRaw !== undefined && metrics.gasRaw !== null) {
    normalizedMetrics.gasRaw = requireInteger(metrics.gasRaw, 'metrics.gasRaw', {
      min: MQ2_ADC_MIN,
      max: MQ2_ADC_MAX
    });
    // New firmware publishes gasLevel only as a compatibility alias. Reject a
    // split-brain frame: anomaly rules read gasLevel while dashboards prefer
    // gasRaw, so differing values could display and alert on different facts.
    if (normalizedMetrics.gasRaw !== normalizedMetrics.gasLevel) {
      throw new TypeError('metrics.gasRaw must equal metrics.gasLevel');
    }
  }

  return {
    timestamp: normalizeTimestamp(payload.timestamp),
    deviceId,
    metrics: normalizedMetrics,
    actuatorStates: {
      fanOn: requireBoolean(actuatorStates.fanOn, 'actuatorStates.fanOn'),
      buzzerActive: requireBoolean(actuatorStates.buzzerActive, 'actuatorStates.buzzerActive'),
      alertLedActive: requireBoolean(actuatorStates.alertLedActive, 'actuatorStates.alertLedActive'),
      // Legacy documents predate the field; the absence means no local override.
      gasAlarmActive: actuatorStates.gasAlarmActive === undefined
        ? false
        : requireBoolean(actuatorStates.gasAlarmActive, 'actuatorStates.gasAlarmActive')
    }
  };
}

async function ingestTelemetry(payload, expectedDeviceId) {
  const normalized = validateTelemetryPayload(payload, expectedDeviceId);
  // Persist first: downstream anomaly decisions should always point to a stored snapshot.
  const reading = await SensorReading.create(normalized);
  const anomalies = await processTelemetryForAnomalies(reading);
  return { reading, anomalies };
}

module.exports = {
  DEVICE_ID_PATTERN,
  ingestTelemetry,
  validateTelemetryPayload
};
