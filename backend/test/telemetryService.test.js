/** Regression coverage for the MQTT telemetry/edge-alert trust boundary. */
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateTelemetryPayload } = require('../services/telemetryService');
const { SensorReading } = require('../models/Schemas');
const { getCurrentActuatorStates, synchronizeActuatorStates } = require('../services/actuatorStateService');
const { handleMqttMessage, parseTopic, validateEdgeAlert } = require('../services/mqttService');
const { MQ2_ADC_MAX, MQ2_UNIT } = require('../config/sensorContract');

function validPayload() {
  return {
    timestamp: 1785974400000,
    deviceId: 'safebox-01',
    metrics: {
      temperature: 28.5,
      humidity: 65.2,
      gasLevel: 180,
      gasRaw: 180,
      gasValid: true,
      gasUnit: MQ2_UNIT,
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
  assert.ok(normalized.timestamp instanceof Date);
});

test('preserves the MQ2 direct ADC index, raw value, and validity flag', () => {
  const payload = validPayload();
  payload.metrics.gasLevel = 642;
  payload.metrics.gasRaw = 642;
  payload.metrics.gasValid = true;
  payload.metrics.gasUnit = 'adc_index';

  const normalized = validateTelemetryPayload(payload, 'safebox-01');
  assert.equal(normalized.metrics.gasLevel, 642);
  assert.equal(normalized.metrics.gasRaw, 642);
  assert.equal(normalized.metrics.gasValid, true);
  assert.equal(normalized.metrics.gasUnit, 'adc_index');
});

test('keeps legacy documents without gasRaw valid at the Mongoose boundary', () => {
  const payload = validPayload();
  delete payload.metrics.gasRaw;
  const normalized = validateTelemetryPayload(payload, 'safebox-01');
  const document = new SensorReading(normalized);

  assert.equal(document.metrics.gasRaw, null);
  assert.equal(document.validateSync(), undefined);
});

test('rejects conflicting MQ2 alias values in one telemetry snapshot', () => {
  const payload = validPayload();
  payload.metrics.gasLevel = 642;
  payload.metrics.gasRaw = 671;

  assert.throws(
    () => validateTelemetryPayload(payload, 'safebox-01'),
    /gasRaw must equal metrics\.gasLevel/
  );
});

test('rejects MQ2 telemetry outside the ESP32 12-bit ADC range', () => {
  const gasLevelOverflow = validPayload();
  gasLevelOverflow.metrics.gasLevel = MQ2_ADC_MAX + 1;
  assert.throws(
    () => validateTelemetryPayload(gasLevelOverflow, 'safebox-01'),
    /gasLevel must be an integer between 0 and 4095/
  );

  const gasRawOverflow = validPayload();
  gasRawOverflow.metrics.gasRaw = MQ2_ADC_MAX + 1;
  assert.throws(
    () => validateTelemetryPayload(gasRawOverflow, 'safebox-01'),
    /gasRaw must be an integer between 0 and 4095/
  );
});

test('rejects fractional MQ2 ADC samples in either compatibility field', () => {
  const fractionalLevel = validPayload();
  fractionalLevel.metrics.gasLevel = 600.5;
  assert.throws(
    () => validateTelemetryPayload(fractionalLevel, 'safebox-01'),
    /gasLevel must be an integer/
  );

  const fractionalRaw = validPayload();
  fractionalRaw.metrics.gasRaw = 180.25;
  assert.throws(
    () => validateTelemetryPayload(fractionalRaw, 'safebox-01'),
    /gasRaw must be an integer/
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

test('accepts only coherent integer gas edge-safety alerts in ADC units', () => {
  const alert = validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'gasLevel',
    observedValue: 720,
    threshold: 600,
    unit: MQ2_UNIT,
    timestamp: 1785974400000
  }, 'safebox-01');
  assert.equal(alert.deviceId, 'safebox-01');
  assert.equal(alert.observedValue, 720);

  assert.throws(() => validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'temperature',
    observedValue: 48,
    threshold: 45,
    unit: MQ2_UNIT
  }, 'safebox-01'), /sensorType must be gasLevel/);

  assert.throws(() => validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'gasLevel',
    observedValue: MQ2_ADC_MAX + 1,
    threshold: 600,
    unit: MQ2_UNIT
  }, 'safebox-01'), /0 to 4095/);

  assert.throws(() => validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'gasLevel',
    observedValue: 720.5,
    threshold: 600,
    unit: MQ2_UNIT
  }, 'safebox-01'), /observedValue must be an integer/);

  assert.throws(() => validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'gasLevel',
    observedValue: 720,
    threshold: 600.5,
    unit: MQ2_UNIT
  }, 'safebox-01'), /threshold must be an integer/);

  assert.throws(() => validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'gasLevel',
    observedValue: 600,
    threshold: 600,
    unit: MQ2_UNIT
  }, 'safebox-01'), /observedValue must be greater than threshold/);

  assert.throws(() => validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'gasLevel',
    observedValue: 720,
    threshold: 600,
    unit: 'ppm'
  }, 'safebox-01'), /unit must be exactly 'adc_index'/);

  assert.throws(() => validateEdgeAlert({
    type: 'EDGE_SAFETY_TRIGGER',
    sensorType: 'gasLevel',
    observedValue: 720,
    threshold: 600
  }, 'safebox-01'), /unit must be exactly 'adc_index'/);
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
