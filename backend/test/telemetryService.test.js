const test = require('node:test');
const assert = require('node:assert/strict');

const { validateTelemetryPayload } = require('../services/telemetryService');
const { parseTopic, validateEdgeAlert } = require('../services/mqttService');

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
  assert.ok(normalized.timestamp instanceof Date);
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
});
