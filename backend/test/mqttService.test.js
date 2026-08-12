const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  initializeMqttService,
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
