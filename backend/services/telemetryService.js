/**
 * Boundary service for untrusted MQTT telemetry. It validates and normalizes a
 * complete device snapshot before any database write or anomaly side effect.
 *
 * Study map (NC-03 -> NC-01): validate topic/payload identity -> persist the
 * normalized fact -> run anomaly decisions against that persisted reading.
 */
const { SensorReading } = require('../models/Schemas');
const { processTelemetryForAnomalies } = require('./anomalyEngine');
const {
  MAX_GAS_ALERT_THRESHOLD,
  MQ2_ADC_MAX,
  MQ2_ADC_MIN,
  MQ2_UNIT
} = require('../config/sensorContract');

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

/** Normalizes sensor values after the caller has confirmed metrics is an object. */
function normalizeMetrics(metrics) {
  const normalized = {
    temperature: requireFiniteNumber(metrics.temperature, 'metrics.temperature', { min: -40, max: 85 }),
    humidity: requireFiniteNumber(metrics.humidity, 'metrics.humidity', { min: 0, max: 100 }),
    gasLevel: requireInteger(metrics.gasLevel, 'metrics.gasLevel', {
      min: MQ2_ADC_MIN,
      max: MQ2_ADC_MAX
    }),
    // Legacy firmware omitted gasValid, so absence means usable; explicit false is preserved.
    gasValid: metrics.gasValid === undefined
      ? true
      : requireBoolean(metrics.gasValid, 'metrics.gasValid'),
    gasUnit: metrics.gasUnit === undefined ? MQ2_UNIT : metrics.gasUnit,
    motionDetected: requireBoolean(metrics.motionDetected, 'metrics.motionDetected')
  };

  if (normalized.gasUnit !== MQ2_UNIT) {
    throw new TypeError(`metrics.gasUnit must be '${MQ2_UNIT}'`);
  }
  if (metrics.gasRaw !== undefined && metrics.gasRaw !== null) {
    normalized.gasRaw = requireInteger(metrics.gasRaw, 'metrics.gasRaw', {
      min: MQ2_ADC_MIN,
      max: MQ2_ADC_MAX
    });
    // Anomaly rules read gasLevel while dashboards prefer gasRaw, so both aliases
    // must describe the same physical ADC sample.
    if (normalized.gasRaw !== normalized.gasLevel) {
      throw new TypeError('metrics.gasRaw must equal metrics.gasLevel');
    }
  }
  if (metrics.gasAlarmThreshold !== undefined && metrics.gasAlarmThreshold !== null) {
    normalized.gasAlarmThreshold = requireInteger(
      metrics.gasAlarmThreshold,
      'metrics.gasAlarmThreshold',
      { min: 1, max: MAX_GAS_ALERT_THRESHOLD }
    );
  }

  return normalized;
}

/** Normalizes the complete device-reported actuator snapshot. */
function normalizeActuatorStates(actuatorStates) {
  return {
    fanOn: requireBoolean(actuatorStates.fanOn, 'actuatorStates.fanOn'),
    buzzerActive: requireBoolean(actuatorStates.buzzerActive, 'actuatorStates.buzzerActive'),
    alertLedActive: requireBoolean(actuatorStates.alertLedActive, 'actuatorStates.alertLedActive'),
    // Legacy documents predate the field; the absence means no local override.
    gasAlarmActive: actuatorStates.gasAlarmActive === undefined
      ? false
      : requireBoolean(actuatorStates.gasAlarmActive, 'actuatorStates.gasAlarmActive')
  };
}

/**
 * Converts a decoded MQTT object into the exact MongoDB document shape.
 * expectedDeviceId comes from the topic and prevents a payload from claiming
 * another device identity while being published on an authorized topic.
 */
function validateTelemetryPayload(payload, expectedDeviceId) {
  // Reject null, arrays, and primitives before reading nested fields.
  requireObject(payload, 'telemetry payload');
  // Topic identity is the fallback for legacy payloads that omit deviceId.
  const deviceId = payload.deviceId || expectedDeviceId;

  if (!deviceId || !DEVICE_ID_PATTERN.test(deviceId)) {
    throw new TypeError('deviceId must contain only letters, numbers, underscores, or hyphens');
  }
  if (expectedDeviceId && deviceId !== expectedDeviceId) {
    // Prevent one authorized topic from injecting records for another device.
    throw new TypeError(`payload deviceId '${deviceId}' does not match MQTT topic device '${expectedDeviceId}'`);
  }

  // Both nested objects are required because each message is one complete snapshot.
  const metrics = requireObject(payload.metrics, 'metrics');
  const actuatorStates = requireObject(payload.actuatorStates, 'actuatorStates');

  return {
    // Invalid dates fail here; omitted timestamps use backend receive time.
    timestamp: normalizeTimestamp(payload.timestamp),
    deviceId,
    // Helpers build exact allow-listed shapes; unknown MQTT fields never reach MongoDB.
    metrics: normalizeMetrics(metrics),
    actuatorStates: normalizeActuatorStates(actuatorStates)
  };
}

async function ingestTelemetry(payload, expectedDeviceId) {
  // No database or action side effect occurs until the complete payload passes validation.
  const normalized = validateTelemetryPayload(payload, expectedDeviceId);
  // Persist first: downstream anomaly decisions should always point to a stored snapshot.
  const reading = await SensorReading.create(normalized);
  // Pass the stored document so anomaly logs always refer to a persisted source fact.
  const anomalies = await processTelemetryForAnomalies(reading);
  return { reading, anomalies };
}

module.exports = {
  DEVICE_ID_PATTERN,
  ingestTelemetry,
  validateTelemetryPayload
};
