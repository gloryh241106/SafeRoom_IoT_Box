/** Verifies real-mode MQTT startup without contacting an external broker. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  initializeMqttService,
  publishThresholdConfig,
  stopMqttService
} = require('../services/mqttService');

test('real MQTT startup subscribes with the MQTT.js topic-map shape', async (t) => {
  const originalEnv = {
    MOCK_HARDWARE: process.env.MOCK_HARDWARE,
    MQTT_BROKER_URL: process.env.MQTT_BROKER_URL,
    MQTT_USERNAME: process.env.MQTT_USERNAME,
    MQTT_PASSWORD: process.env.MQTT_PASSWORD
  };
  t.after(async () => {
    await stopMqttService();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.MOCK_HARDWARE = 'false';
  process.env.MQTT_BROKER_URL = 'mqtts://broker.example.test:8883';
  process.env.MQTT_USERNAME = 'test-user';
  process.env.MQTT_PASSWORD = 'test-password';

  const client = new EventEmitter();
  client.connected = true;
  client.end = (_force, _options, callback) => callback();

  let subscribedTopics;
  client.subscribe = (topics, callback) => {
    subscribedTopics = topics;
    callback(null);
  };

  const logs = [];
  initializeMqttService({
    connect: () => client,
    logger: {
      log: (message) => logs.push(message),
      warn() {},
      error() {}
    }
  });
  client.emit('connect');

  assert.deepEqual(subscribedTopics, {
    'safebox/+/telemetry': { qos: 0 },
    'safebox/+/alerts': { qos: 1 },
    'safebox/+/status': { qos: 1 }
  });
  assert.equal(
    logs.includes('[MQTT] Connected and subscribed to telemetry, alerts, and status topics.'),
    true
  );
});

test('publishes a retained threshold config so reconnecting devices receive it', async (t) => {
  const originalEnv = {
    MOCK_HARDWARE: process.env.MOCK_HARDWARE,
    MQTT_BROKER_URL: process.env.MQTT_BROKER_URL,
    MQTT_USERNAME: process.env.MQTT_USERNAME,
    MQTT_PASSWORD: process.env.MQTT_PASSWORD
  };
  t.after(async () => {
    await stopMqttService();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.MOCK_HARDWARE = 'false';
  process.env.MQTT_BROKER_URL = 'mqtts://broker.example.test:8883';
  process.env.MQTT_USERNAME = 'test-user';
  process.env.MQTT_PASSWORD = 'test-password';

  const client = new EventEmitter();
  client.connected = true;
  client.end = (_force, _options, callback) => callback();
  const published = [];
  client.publish = (topic, payload, options, callback) => {
    published.push({ topic, payload, options });
    callback(null);
  };
  client.subscribe = (_topics, callback) => callback(null);
  initializeMqttService({
    connect: () => client,
    logger: { log() {}, warn() {}, error() {} }
  });

  const result = await publishThresholdConfig('safebox-01', 850, 750);
  assert.equal(result.status, 'published');
  assert.equal(result.topic, 'safebox/safebox-01/config');
  assert.equal(published[0].options.qos, 1);
  assert.equal(published[0].options.retain, true);
  assert.deepEqual(JSON.parse(published[0].payload), {
    gasAlarmThreshold: 850,
    gasClearThreshold: 750
  });
});

test('reports mocked or offline delivery and rejects invalid threshold configs', async () => {
  const originalMock = process.env.MOCK_HARDWARE;

  process.env.MOCK_HARDWARE = 'true';
  assert.equal((await publishThresholdConfig('safebox-01', 850, 750)).status, 'mocked');
  process.env.MOCK_HARDWARE = 'false';

  assert.equal((await publishThresholdConfig('safebox-01', 850, 750)).status, 'offline');
  await assert.rejects(publishThresholdConfig('bad device', 850, 750), /Invalid deviceId/);
  await assert.rejects(publishThresholdConfig('safebox-01', 4095, 3995), /gasAlarmThreshold/);
  await assert.rejects(publishThresholdConfig('safebox-01', 850, 900), /gasClearThreshold/);

  if (originalMock === undefined) delete process.env.MOCK_HARDWARE;
  else process.env.MOCK_HARDWARE = originalMock;
});
