const test = require('node:test');
const assert = require('node:assert/strict');

const { validateTelemetryPayload } = require('../services/telemetryService');
const { SensorReading } = require('../models/Schemas');
const { getCurrentActuatorStates, synchronizeActuatorStates } = require('../services/actuatorStateService');
const { handleMqttMessage, parseTopic, validateEdgeAlert } = require('../services/mqttService');

function validPayload() {
  return {
    timestamp: 1785974400000,
    deviceId: 'safebox-01',
    metrics: {
      temperature: 28.5,
      humidity: 65.2,
      gasLevel: 180,
      lightIntensity: 450,
      motionDetected: false
    },
    actuatorStates: {
      fanOn: false,
      buzzerActive: false,
      alertLedActive: false
    }
  };
}

test('normalizes a complete ESP32 telemetry payload', () => {
  const normalized = validateTelemetryPayload(validPayload(), 'safebox-01');
  assert.equal(normalized.deviceId, 'safebox-01');
  assert.equal(normalized.metrics.lightIntensity, 450);
  assert.deepEqual(normalized.sensorStatus.gas, { state: 'ready', ready: true });
  assert.ok(normalized.timestamp instanceof Date);
});

test('accepts unavailable gas PPM only while the MQ2 is preparing', () => {
  const payload = validPayload();
  payload.metrics.gasLevel = null;
  payload.sensorStatus = {
    gas: {
      state: 'warming_up',
      ready: false,
      adcRaw: 1840,
      adcMillivolts: 1120,
      sourceMillivolts: 2240,
      burnInRemainingSeconds: 0
    }
  };

  const normalized = validateTelemetryPayload(payload, 'safebox-01');
  assert.equal(normalized.metrics.gasLevel, null);
  assert.equal(normalized.sensorStatus.gas.state, 'warming_up');
  assert.equal(normalized.sensorStatus.gas.adcMillivolts, 1120);
});

test('rejects contradictory MQ2 readiness and PPM fields', () => {
  const readyWithoutPpm = validPayload();
  readyWithoutPpm.metrics.gasLevel = null;
  readyWithoutPpm.sensorStatus = { gas: { state: 'ready', ready: true } };
  assert.throws(
    () => validateTelemetryPayload(readyWithoutPpm, 'safebox-01'),
    /gasLevel must be a finite number when the gas sensor is ready/
  );

  const warmingWithPpm = validPayload();
  warmingWithPpm.sensorStatus = { gas: { state: 'warming_up', ready: false } };
  assert.throws(
    () => validateTelemetryPayload(warmingWithPpm, 'safebox-01'),
    /gasLevel must be null while the gas sensor is not ready/
  );
});

test('rejects topic/payload device mismatches and missing actuator states', () => {
  assert.throws(
    () => validateTelemetryPayload(validPayload(), 'safebox-02'),
    /does not match MQTT topic/
  );

  const payload = validPayload();
  delete payload.actuatorStates.fanOn;
  assert.throws(() => validateTelemetryPayload(payload, 'safebox-01'), /fanOn must be a boolean/);
});

test('parses only registered SafeRoom MQTT topics', () => {
  assert.deepEqual(parseTopic('safebox/safebox-01/telemetry'), {
    deviceId: 'safebox-01',
    channel: 'telemetry'
  });
  assert.throws(() => parseTopic('other/safebox-01/telemetry'), /Unsupported MQTT topic/);
});

test('accepts only gas edge-safety alerts with finite values', () => {
  const alert = validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'gasLevel',
    observedValue: 720,
    threshold: 600,
    timestamp: 1785974400000
  }, 'safebox-01');
  assert.equal(alert.deviceId, 'safebox-01');
  assert.equal(alert.observedValue, 720);

  assert.throws(() => validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'temperature',
    observedValue: 48,
    threshold: 45
  }, 'safebox-01'), /sensorType must be gasLevel/);

  assert.throws(() => validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'gasLevel',
    observedValue: 1800,
    threshold: 1500,
    calibrated: false
  }, 'safebox-01'), /uncalibrated gas alerts must remain local/);
});

test('synchronizes actuator status from confirmed device telemetry', async () => {
  const originalCreate = SensorReading.create;
  const payload = validPayload();
  payload.actuatorStates.fanOn = true;
  payload.actuatorStates.alertLedActive = true;
  SensorReading.create = async (document) => document;

  try {
    await handleMqttMessage(
      'safebox/safebox-01/telemetry',
      Buffer.from(JSON.stringify(payload))
    );
    assert.deepEqual(getCurrentActuatorStates(), {
      fanOn: true,
      buzzerActive: false,
      alertLedActive: true
    });
  } finally {
    SensorReading.create = originalCreate;
    synchronizeActuatorStates({
      fanOn: false,
      buzzerActive: false,
      alertLedActive: false
    });
  }
});
