const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WINDOW_SIZE,
  evaluateZScore,
  processTelemetryForAnomalies,
  resetAnomalyEngineForTests
} = require('../services/anomalyEngine');
const { AnomalyLog } = require('../models/Schemas');

test.beforeEach(() => resetAnomalyEngineForTests());

test('waits for 30 prior samples before evaluating a Z-score spike', () => {
  for (let index = 0; index < WINDOW_SIZE; index += 1) {
    const stableValue = 25 + ((index % 3) - 1) * 0.1;
    const result = evaluateZScore('device-a', 'temperature', stableValue);
    assert.equal(result.ready, false);
  }

  const spike = evaluateZScore('device-a', 'temperature', 35);
  assert.equal(spike.ready, true);
  assert.equal(spike.isAnomaly, true);
  assert.ok(Math.abs(spike.zScore) > 3);
});

test('keeps rolling windows isolated per device and metric', () => {
  for (let index = 0; index < WINDOW_SIZE; index += 1) {
    evaluateZScore('device-a', 'temperature', 20 + (index % 2) * 0.2);
  }

  const otherDevice = evaluateZScore('device-b', 'temperature', 40);
  const otherMetric = evaluateZScore('device-a', 'humidity', 80);
  assert.equal(otherDevice.ready, false);
  assert.equal(otherMetric.ready, false);
});

test('returns zero and no statistical anomaly for a zero-variance baseline', () => {
  for (let index = 0; index < WINDOW_SIZE; index += 1) {
    evaluateZScore('device-a', 'temperature', 25);
  }

  const result = evaluateZScore('device-a', 'temperature', 35);
  assert.deepEqual(
    { ready: result.ready, zScore: result.zScore, stdDev: result.stdDev, isAnomaly: result.isAnomaly },
    { ready: true, zScore: 0, stdDev: 0, isAnomaly: false }
  );
});

test('minimum physical delta filters high Z-scores caused by sensor noise', () => {
  for (let index = 0; index < WINDOW_SIZE; index += 1) {
    evaluateZScore('device-a', 'temperature', 25 + (index % 2 === 0 ? -0.01 : 0.01));
  }

  const result = evaluateZScore('device-a', 'temperature', 25.5);
  assert.ok(Math.abs(result.zScore) > 3);
  assert.equal(result.isAnomaly, false);
});

test('deduplicates rapid repeated anomalies for the same device, sensor, and trigger', async () => {
  const originalCreate = AnomalyLog.create;
  const createdDocuments = [];
  AnomalyLog.create = async (document) => {
    createdDocuments.push(document);
    return document;
  };

  try {
    const telemetry = {
      deviceId: 'device-a',
      timestamp: new Date('2026-08-06T00:00:00.000Z'),
      metrics: {
        temperature: 25,
        humidity: 60,
        gasLevel: 720,
        motionDetected: false
      }
    };

    assert.equal((await processTelemetryForAnomalies(telemetry)).length, 1);
    assert.equal((await processTelemetryForAnomalies(telemetry)).length, 0);
    assert.equal(createdDocuments.length, 1);
    assert.equal(createdDocuments[0].triggerType, 'HARD_THRESHOLD_BREACH');
  } finally {
    AnomalyLog.create = originalCreate;
  }
});
