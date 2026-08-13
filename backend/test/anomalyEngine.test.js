const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WINDOW_SIZE,
  evaluateZScore,
  processTelemetryForAnomalies,
  resetAnomalyEngineForTests,
  setControlPublisher,
  updateThresholds
} = require('../services/anomalyEngine');
const { AnomalyLog } = require('../models/Schemas');
const {
  resetEmailServiceForTests,
  sendAlertEmail,
  setEmailServiceTestOverrides
} = require('../services/emailService');

test.beforeEach(() => resetAnomalyEngineForTests());
test.afterEach(() => resetEmailServiceForTests());

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

test('does not apply Z-score analysis to gas or motion values', () => {
  assert.deepEqual(evaluateZScore('device-a', 'gasLevel', 700), {
    ready: false,
    zScore: null,
    isAnomaly: false
  });
  assert.deepEqual(evaluateZScore('device-a', 'motionDetected', 1), {
    ready: false,
    zScore: null,
    isAnomaly: false
  });
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

test('applies the hard-rule matrix for gas, armed motion, and humidity', async () => {
  const originalCreate = AnomalyLog.create;
  const createdDocuments = [];
  const publishedCommands = [];
  AnomalyLog.create = async (document) => {
    createdDocuments.push(document);
    return document;
  };
  setControlPublisher(async (deviceId, actuator, state) => {
    publishedCommands.push({ deviceId, actuator, state });
    return { status: 'mocked' };
  });

  try {
    const created = await processTelemetryForAnomalies({
      deviceId: 'device-a',
      timestamp: new Date('2026-08-06T00:00:00.000Z'),
      metrics: {
        temperature: 25,
        humidity: 90,
        gasLevel: 700,
        motionDetected: true
      }
    });

    assert.equal(created.length, 3);
    assert.deepEqual(
      createdDocuments
        .map(({ sensorType, triggerType, severity }) => ({ sensorType, triggerType, severity }))
        .sort((left, right) => left.sensorType.localeCompare(right.sensorType)),
      [
        { sensorType: 'gasLevel', triggerType: 'HARD_THRESHOLD_BREACH', severity: 'CRITICAL' },
        { sensorType: 'humidity', triggerType: 'HARD_THRESHOLD_BREACH', severity: 'MEDIUM' },
        { sensorType: 'motionDetected', triggerType: 'HARD_THRESHOLD_BREACH', severity: 'HIGH' }
      ]
    );
    assert.deepEqual(publishedCommands, [
      { deviceId: 'device-a', actuator: 'alertLed', state: true }
    ]);
  } finally {
    AnomalyLog.create = originalCreate;
  }
});

test('runs the Z-score spike through fan control, anomaly logging, and email throttling', async () => {
  const originalCreate = AnomalyLog.create;
  const originalEnvironment = {
    EMAIL_ENABLED: process.env.EMAIL_ENABLED,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    ALERT_RECIPIENT_EMAIL: process.env.ALERT_RECIPIENT_EMAIL
  };
  const createdDocuments = [];
  const publishedCommands = [];
  const sentMessages = [];

  Object.assign(process.env, {
    EMAIL_ENABLED: 'true',
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'sender@example.test',
    SMTP_PASS: 'test-password',
    ALERT_RECIPIENT_EMAIL: 'owner@example.test'
  });
  AnomalyLog.create = async (document) => {
    createdDocuments.push(document);
    return document;
  };
  setControlPublisher(async (deviceId, actuator, state) => {
    publishedCommands.push({ deviceId, actuator, state });
    return { status: 'published' };
  });
  setEmailServiceTestOverrides({
    transport: {
      async sendMail(message) {
        sentMessages.push(message);
        return { messageId: `message-${sentMessages.length}` };
      }
    },
    now: () => Date.parse('2026-08-06T00:00:00.000Z')
  });
  updateThresholds({ isAutomatic: true });

  try {
    for (let index = 0; index < WINDOW_SIZE; index += 1) {
      const stableReading = {
        deviceId: 'safebox-01',
        timestamp: new Date(Date.parse('2026-08-06T00:00:00.000Z') + index * 2000),
        metrics: {
          temperature: 25 + ((index % 3) - 1) * 0.1,
          humidity: 60,
          gasLevel: 180,
          motionDetected: false
        }
      };
      assert.equal((await processTelemetryForAnomalies(stableReading)).length, 0);
    }

    const created = await processTelemetryForAnomalies({
      deviceId: 'safebox-01',
      timestamp: new Date('2026-08-06T00:01:00.000Z'),
      metrics: {
        temperature: 35,
        humidity: 60,
        gasLevel: 180,
        motionDetected: false
      }
    });

    assert.equal(created.length, 1);
    assert.equal(createdDocuments[0].triggerType, 'Z_SCORE_EXCEEDED');
    assert.ok(Math.abs(createdDocuments[0].calculatedZScore) > 3);
    assert.deepEqual(publishedCommands, [
      { deviceId: 'safebox-01', actuator: 'fan', state: true }
    ]);
    assert.equal(sentMessages.length, 1);
    assert.ok(createdDocuments[0].actionsTaken.includes('FAN_ON_COMMAND_PUBLISHED'));
    assert.ok(createdDocuments[0].actionsTaken.includes('EMAIL_SENT'));
    assert.equal((await sendAlertEmail(createdDocuments[0])).status, 'throttled');
  } finally {
    AnomalyLog.create = originalCreate;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
