/** Covers statistical boundaries, hard rules, dedupe, and anomaly side effects. */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WINDOW_SIZE,
  evaluateZScore,
  processTelemetryForAnomalies,
  resetAnomalyEngineForTests,
  setControlPublisher,
  setSystemArmed,
  updateThresholds
} = require('../services/anomalyEngine');
const { AnomalyLog, User } = require('../models/Schemas');
const { MAX_GAS_ALERT_THRESHOLD } = require('../config/sensorContract');
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

test('keeps the MQ2 alert threshold integer and below the maximum ADC sample', () => {
  assert.equal(
    updateThresholds({ gasMax: MAX_GAS_ALERT_THRESHOLD }).gasMax,
    MAX_GAS_ALERT_THRESHOLD
  );
  assert.throws(() => updateThresholds({ gasMax: 4095 }), /integer between 1 and 4094/);
  assert.throws(() => updateThresholds({ gasMax: 600.5 }), /integer between 1 and 4094/);
  assert.equal(updateThresholds({ gasMax: 600 }).gasMax, 600);
});

test('uses the same MQ2 threshold ceiling in the persisted user schema', () => {
  const createUser = (gasMax) => new User({
    username: `threshold-${gasMax}`,
    email: `threshold-${gasMax}@example.test`,
    passwordHash: 'not-used-by-schema-validation',
    settings: { thresholds: { gasMax } }
  });

  assert.equal(createUser(MAX_GAS_ALERT_THRESHOLD).validateSync(), undefined);
  assert.match(
    createUser(4095).validateSync().errors['settings.thresholds.gasMax'].message,
    /more than maximum allowed value \(4094\)/
  );
  assert.match(
    createUser(600.5).validateSync().errors['settings.thresholds.gasMax'].message,
    /integer ADC index/
  );
});

test('deduplicates rapid repeated anomalies for the same device, sensor, and trigger', async () => {
  const originalCreate = AnomalyLog.create;
  const originalUpdate = AnomalyLog.findByIdAndUpdate;
  const createdDocuments = [];
  AnomalyLog.create = async (document) => {
    createdDocuments.push(document);
    return document;
  };
  AnomalyLog.findByIdAndUpdate = async () => null;

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
    AnomalyLog.findByIdAndUpdate = originalUpdate;
  }
});

test('does not trigger a gas anomaly while the MQ2 startup reading is invalid', async () => {
  const telemetry = {
    deviceId: 'device-mq2-startup',
    timestamp: new Date('2026-08-13T00:00:00.000Z'),
    metrics: {
      temperature: 25,
      humidity: 60,
      gasLevel: 700,
      gasValid: false,
      motionDetected: false
    }
  };

  assert.deepEqual(await processTelemetryForAnomalies(telemetry), []);
});

test('suppresses every anomaly candidate while the system is DISARMED', async () => {
  const originalCreate = AnomalyLog.create;
  AnomalyLog.create = async (document) => {
    throw new Error('AnomalyLog.create must not run while DISARMED');
  };
  setSystemArmed(false);

  try {
    const created = await processTelemetryForAnomalies({
      deviceId: 'device-disarmed',
      timestamp: new Date('2026-08-13T00:00:00.000Z'),
      metrics: {
        temperature: 25,
        humidity: 90,
        gasLevel: 700,
        motionDetected: true
      }
    });

    assert.deepEqual(created, []);
  } finally {
    AnomalyLog.create = originalCreate;
  }
});

test('resumes anomaly evaluation after the system is re-armed', async () => {
  const originalCreate = AnomalyLog.create;
  const originalUpdate = AnomalyLog.findByIdAndUpdate;
  const createdDocuments = [];
  AnomalyLog.create = async (document) => {
    const stored = { _id: `id-${createdDocuments.length}`, ...document };
    createdDocuments.push(stored);
    return stored;
  };
  AnomalyLog.findByIdAndUpdate = async (id, update) => {
    const document = createdDocuments.find((entry) => entry._id === id);
    if (document) Object.assign(document, update);
    return document;
  };
  setSystemArmed(false);
  const disarmedResult = await processTelemetryForAnomalies({
    deviceId: 'device-rearmed',
    timestamp: new Date('2026-08-13T00:00:00.000Z'),
    metrics: {
      temperature: 25,
      humidity: 60,
      gasLevel: 700,
      motionDetected: false
    }
  });
  assert.deepEqual(disarmedResult, []);

  setSystemArmed(true);
  try {
    const created = await processTelemetryForAnomalies({
      deviceId: 'device-rearmed',
      timestamp: new Date('2026-08-13T00:00:01.000Z'),
      metrics: {
        temperature: 25,
        humidity: 60,
        gasLevel: 700,
        motionDetected: false
      }
    });
    assert.equal(created.length, 1);
    assert.equal(createdDocuments[0].triggerType, 'HARD_THRESHOLD_BREACH');
  } finally {
    AnomalyLog.create = originalCreate;
    AnomalyLog.findByIdAndUpdate = originalUpdate;
  }
});

test('applies the hard-rule matrix for gas, armed motion, and humidity', async () => {
  const originalCreate = AnomalyLog.create;
  const originalUpdate = AnomalyLog.findByIdAndUpdate;
  const createdDocuments = [];
  const publishedCommands = [];
  AnomalyLog.create = async (document) => {
    createdDocuments.push(document);
    return document;
  };
  AnomalyLog.findByIdAndUpdate = async () => null;
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
    assert.deepEqual(publishedCommands, []);
  } finally {
    AnomalyLog.create = originalCreate;
    AnomalyLog.findByIdAndUpdate = originalUpdate;
  }
});

test('runs the Z-score spike through fan control, anomaly logging, and email throttling', async () => {
  const originalCreate = AnomalyLog.create;
  const originalUpdate = AnomalyLog.findByIdAndUpdate;
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
    const stored = { _id: `id-${createdDocuments.length}`, ...document };
    createdDocuments.push(stored);
    return stored;
  };
  AnomalyLog.findByIdAndUpdate = async (id, update) => {
    const document = createdDocuments.find((entry) => entry._id === id);
    if (document) Object.assign(document, update);
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
    AnomalyLog.findByIdAndUpdate = originalUpdate;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
