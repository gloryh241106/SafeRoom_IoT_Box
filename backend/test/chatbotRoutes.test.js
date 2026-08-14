/** Regression coverage for chatbot replies that depend on live backend state. */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.MOCK_HARDWARE = 'true';
process.env.JWT_SECRET = 'chatbot-route-test-secret';

const { SensorReading, AnomalyLog } = require('../models/Schemas');
const {
  resetAnomalyEngineForTests,
  updateThresholds
} = require('../services/anomalyEngine');
const { app } = require('../server');

let server;
let baseUrl;
let token;

test.before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = jwt.sign({ id: 'chatbot-test-user', username: 'chatbot-test' }, process.env.JWT_SECRET);
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test.beforeEach(() => resetAnomalyEngineForTests());

test('reports the current runtime MQ2 threshold instead of a hard-coded default', async () => {
  const originalSensorFindOne = SensorReading.findOne;
  const originalAnomalyFindOne = AnomalyLog.findOne;

  SensorReading.findOne = () => ({
    async sort() {
      return {
        metrics: {
          temperature: 28,
          humidity: 62,
          gasLevel: 210,
          gasRaw: 210,
          gasValid: true,
          gasUnit: 'adc_index',
          motionDetected: false
        },
        actuatorStates: {
          fanOn: false,
          buzzerActive: false,
          alertLedActive: false
        }
      };
    }
  });
  AnomalyLog.findOne = () => ({ async sort() { return null; } });
  updateThresholds({ gasMax: 777 });

  try {
    const response = await fetch(`${baseUrl}/api/v1/chatbot/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'Is there any gas or smoke?', deviceId: 'safebox-01' })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.detectedIntent, 'gas');
    assert.match(body.reply, /ADC threshold: 777/);
    assert.doesNotMatch(body.reply, /ADC threshold: 600/);
  } finally {
    SensorReading.findOne = originalSensorFindOne;
    AnomalyLog.findOne = originalAnomalyFindOne;
  }
});

test('returns explicit no-data responses instead of zero or false sensor readings', async () => {
  const originalSensorFindOne = SensorReading.findOne;
  const originalAnomalyFindOne = AnomalyLog.findOne;

  SensorReading.findOne = () => ({ async sort() { return null; } });
  AnomalyLog.findOne = () => ({ async sort() { return null; } });

  const cases = [
    { message: 'Check gas', field: 'currentGasLevel' },
    { message: 'Check motion', field: 'currentMotion' },
    { message: 'Check temperature', field: 'temperature' },
    { message: 'Check humidity', field: 'humidity' }
  ];

  try {
    for (const testCase of cases) {
      const response = await fetch(`${baseUrl}/api/v1/chatbot/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: testCase.message, deviceId: 'safebox-01' })
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.data[testCase.field], null);
      assert.match(body.reply, /No .*telemetry has been recorded/i);
    }
  } finally {
    SensorReading.findOne = originalSensorFindOne;
    AnomalyLog.findOne = originalAnomalyFindOne;
  }
});
