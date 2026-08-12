const mqtt = require('mqtt');
const { processEdgeAlert } = require('./anomalyEngine');
const { ingestTelemetry, DEVICE_ID_PATTERN } = require('./telemetryService');
const { updateActuatorState } = require('./mockTelemetryGenerator');

const TOPIC_PATTERN = /^safebox\/([A-Za-z0-9_-]{1,64})\/(telemetry|alerts|status)$/;
const ACTUATORS = new Set(['fan', 'buzzer', 'alertLed']);

let mqttClient = null;
let mqttMode = 'stopped';
const deviceStatuses = new Map();

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function isMockHardware(env = process.env) {
  return parseBoolean(env.MOCK_HARDWARE, true);
}

function parseTopic(topic) {
  const match = TOPIC_PATTERN.exec(topic);
  if (!match) throw new TypeError(`Unsupported MQTT topic '${topic}'`);
  return { deviceId: match[1], channel: match[2] };
}

function parseJsonMessage(message) {
  if (message.length > 64 * 1024) throw new RangeError('MQTT message exceeds 64 KiB');
  try {
    return JSON.parse(message.toString('utf8'));
  } catch (error) {
    throw new TypeError(`MQTT payload is not valid JSON: ${error.message}`);
  }
}

function validateEdgeAlert(payload, deviceId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('edge alert payload must be an object');
  }
  if (payload.type !== 'EDGE_SAFETY_TRIGGER') {
    throw new TypeError('edge alert type must be EDGE_SAFETY_TRIGGER');
  }
  if (payload.sensorType !== 'gasLevel') {
    throw new TypeError('edge alert sensorType must be gasLevel');
  }
  if (!Number.isFinite(payload.observedValue) || !Number.isFinite(payload.threshold)) {
    throw new TypeError('edge alert observedValue and threshold must be finite numbers');
  }
  const timestamp = payload.timestamp === undefined ? new Date() : new Date(payload.timestamp);
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('edge alert timestamp must be valid');

  return {
    deviceId,
    sensorType: 'gasLevel',
    observedValue: payload.observedValue,
    threshold: payload.threshold,
    timestamp
  };
}

async function handleMqttMessage(topic, message) {
  const { deviceId, channel } = parseTopic(topic);
  const payload = parseJsonMessage(message);

  if (channel === 'telemetry') return ingestTelemetry(payload, deviceId);
  if (channel === 'alerts') return processEdgeAlert(validateEdgeAlert(payload, deviceId));

  if (payload.status !== 'online' && payload.status !== 'offline') {
    throw new TypeError('device status must be online or offline');
  }
  deviceStatuses.set(deviceId, { status: payload.status, updatedAt: new Date() });
  return deviceStatuses.get(deviceId);
}

function requireMqttConfig(env = process.env) {
  const brokerUrl = env.MQTT_BROKER_URL;
  if (!brokerUrl) throw new Error('MQTT_BROKER_URL is required when MOCK_HARDWARE=false.');
  if (!brokerUrl.startsWith('mqtts://') && !parseBoolean(env.MQTT_ALLOW_INSECURE, false)) {
    throw new Error('MQTT_BROKER_URL must use mqtts:// unless MQTT_ALLOW_INSECURE=true.');
  }
  if (!env.MQTT_USERNAME || !env.MQTT_PASSWORD) {
    throw new Error('MQTT_USERNAME and MQTT_PASSWORD are required when MOCK_HARDWARE=false.');
  }

  return {
    brokerUrl,
    options: {
      clientId: env.MQTT_CLIENT_ID || `safebox_backend_${Math.random().toString(16).slice(2, 10)}`,
      username: env.MQTT_USERNAME,
      password: env.MQTT_PASSWORD,
      clean: true,
      connectTimeout: Number(env.MQTT_CONNECT_TIMEOUT_MS || 10_000),
      reconnectPeriod: Number(env.MQTT_RECONNECT_PERIOD_MS || 2_000),
      rejectUnauthorized: parseBoolean(env.MQTT_TLS_REJECT_UNAUTHORIZED, true),
      resubscribe: true
    }
  };
}

function initializeMqttService({ logger = console, connect = mqtt.connect } = {}) {
  if (isMockHardware()) {
    mqttMode = 'mock';
    logger.log('[MQTT] MOCK_HARDWARE=true; broker connection is disabled.');
    return null;
  }
  if (mqttClient) return mqttClient;

  const { brokerUrl, options } = requireMqttConfig();
  mqttMode = 'connecting';
  mqttClient = connect(brokerUrl, options);

  mqttClient.on('connect', () => {
    mqttMode = 'connected';
    mqttClient.subscribe({
      'safebox/+/telemetry': { qos: 0 },
      'safebox/+/alerts': { qos: 1 },
      'safebox/+/status': { qos: 1 }
    }, (error) => {
      if (error) logger.error('[MQTT] Subscription failed:', error.message);
      else logger.log('[MQTT] Connected and subscribed to telemetry, alerts, and status topics.');
    });
  });

  mqttClient.on('message', (topic, message) => {
    handleMqttMessage(topic, message).catch((error) => {
      logger.error(`[MQTT] Rejected message on ${topic}: ${error.message}`);
    });
  });
  mqttClient.on('reconnect', () => {
    mqttMode = 'reconnecting';
    logger.warn('[MQTT] Reconnecting to broker...');
  });
  mqttClient.on('offline', () => {
    mqttMode = 'offline';
    logger.warn('[MQTT] Broker connection is offline.');
  });
  mqttClient.on('error', (error) => logger.error('[MQTT] Client error:', error.message));

  return mqttClient;
}

async function publishControlCommand(deviceId, actuator, state) {
  if (!DEVICE_ID_PATTERN.test(deviceId)) throw new TypeError('Invalid deviceId');
  if (!ACTUATORS.has(actuator)) throw new TypeError(`Unsupported actuator '${actuator}'`);
  if (typeof state !== 'boolean') throw new TypeError('Actuator state must be a boolean');

  if (isMockHardware()) {
    updateActuatorState(actuator, state);
    return { status: 'mocked', topic: null };
  }
  if (!mqttClient || !mqttClient.connected) {
    const error = new Error('MQTT broker is not connected');
    error.code = 'MQTT_OFFLINE';
    throw error;
  }

  const topic = `safebox/${deviceId}/control`;
  const payload = JSON.stringify({ actuator, state: state ? 'on' : 'off' });
  await new Promise((resolve, reject) => {
    mqttClient.publish(topic, payload, { qos: 1, retain: false }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  return { status: 'published', topic };
}

function getMqttStatus(deviceId) {
  return {
    mode: mqttMode,
    brokerConnected: Boolean(mqttClient?.connected),
    device: deviceStatuses.get(deviceId) || null
  };
}

async function stopMqttService() {
  if (mqttClient) {
    const client = mqttClient;
    mqttClient = null;
    await new Promise((resolve) => client.end(false, {}, resolve));
  }
  mqttMode = 'stopped';
}

module.exports = {
  getMqttStatus,
  handleMqttMessage,
  initializeMqttService,
  isMockHardware,
  parseTopic,
  publishControlCommand,
  requireMqttConfig,
  stopMqttService,
  validateEdgeAlert
};
