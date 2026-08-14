/**
 * MQTT adapter for the ESP32/backend boundary. Incoming topic identity and JSON
 * shape are validated before persistence; outgoing control messages are published
 * at QoS 1 and only then reflected in the optimistic actuator snapshot.
 */
const mqtt = require('mqtt');
const { processEdgeAlert } = require('./anomalyEngine');
const { ingestTelemetry, DEVICE_ID_PATTERN } = require('./telemetryService');
const { synchronizeActuatorStates, updateActuatorState } = require('./actuatorStateService');
const {
  MAX_GAS_ALERT_THRESHOLD,
  MQ2_ADC_MAX,
  MQ2_ADC_MIN,
  MQ2_UNIT
} = require('../config/sensorContract');

const TOPIC_PATTERN = /^safebox\/([A-Za-z0-9_-]{1,64})\/(telemetry|alerts|status)$/;
const ACTUATORS = new Set(['fan']);

let mqttClient = null;
let mqttMode = 'stopped';
const deviceStatuses = new Map();

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function isMockHardware(env = process.env) {
  // Simulation is opt-in for isolated tests; production defaults to the real MQTT path.
  return parseBoolean(env.MOCK_HARDWARE, false);
}

function parseTopic(topic) {
  const match = TOPIC_PATTERN.exec(topic);
  if (!match) throw new TypeError(`Unsupported MQTT topic '${topic}'`);
  return { deviceId: match[1], channel: match[2] };
}

function parseJsonMessage(message) {
  // Bound parsing work before JSON.parse to reduce memory abuse from broker messages.
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
  if (payload.unit !== MQ2_UNIT) {
    throw new TypeError(`edge alert unit must be exactly '${MQ2_UNIT}'`);
  }
  if (
    !Number.isInteger(payload.observedValue)
    || payload.observedValue < MQ2_ADC_MIN
    || payload.observedValue > MQ2_ADC_MAX
  ) {
    throw new TypeError(`edge alert observedValue must be an integer MQ2 ADC index from ${MQ2_ADC_MIN} to ${MQ2_ADC_MAX}`);
  }
  if (!Number.isInteger(payload.threshold) || payload.threshold <= MQ2_ADC_MIN || payload.threshold > MAX_GAS_ALERT_THRESHOLD) {
    throw new TypeError(`edge alert threshold must be an integer MQ2 ADC index from 1 to ${MAX_GAS_ALERT_THRESHOLD}`);
  }
  if (payload.observedValue <= payload.threshold) {
    throw new RangeError('edge alert observedValue must be greater than threshold');
  }
  const timestamp = payload.timestamp === undefined ? new Date() : new Date(payload.timestamp);
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('edge alert timestamp must be valid');

  return {
    deviceId,
    sensorType: 'gasLevel',
    observedValue: payload.observedValue,
    threshold: payload.threshold,
    unit: MQ2_UNIT,
    timestamp
  };
}

/** Dispatches a decoded broker message by the channel encoded in its validated topic. */
async function handleMqttMessage(topic, message) {
  const { deviceId, channel } = parseTopic(topic);
  const payload = parseJsonMessage(message);

  if (channel === 'telemetry') {
    const result = await ingestTelemetry(payload, deviceId);
    // Only a validated and persisted device report may override optimistic command state.
    synchronizeActuatorStates(result.reading.actuatorStates);
    return result;
  }
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

/** Starts one MQTT client, or explicitly enters mock mode without network I/O. */
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

/**
 * Publishes a validated actuator command and resolves only after MQTT.js invokes
 * its publish callback. QoS 1 acknowledges broker receipt, not physical actuation;
 * confirmed hardware state arrives later in telemetry.
 */
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
  // Firmware accepts strings for wire compatibility even though the REST boundary uses booleans.
  const payload = JSON.stringify({ actuator, state: state ? 'on' : 'off' });
  await new Promise((resolve, reject) => {
    mqttClient.publish(topic, payload, { qos: 1, retain: false }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  // This remains optimistic until handleMqttMessage receives the device snapshot.
  updateActuatorState(actuator, state);
  return { status: 'published', topic };
}

/**
 * Publishes the gas edge thresholds to the device over MQTT so the ESP32 can
 * apply them live (no reflash). The message is retained so a device that
 * reconnects later receives the latest configuration. Best-effort: an offline
 * broker reports status 'offline' instead of failing the caller.
 */
async function publishThresholdConfig(deviceId, alarmThreshold, clearThreshold) {
  if (!DEVICE_ID_PATTERN.test(deviceId)) throw new TypeError('Invalid deviceId');
  if (!Number.isInteger(alarmThreshold) || alarmThreshold < 1 || alarmThreshold > MAX_GAS_ALERT_THRESHOLD) {
    throw new TypeError(`gasAlarmThreshold must be an integer from 1 to ${MAX_GAS_ALERT_THRESHOLD}`);
  }
  if (!Number.isInteger(clearThreshold) || clearThreshold < 0 || clearThreshold > alarmThreshold) {
    throw new TypeError('gasClearThreshold must be an integer from 0 to gasAlarmThreshold');
  }

  const topic = `safebox/${deviceId}/config`;
  if (isMockHardware()) return { status: 'mocked', topic: null };
  if (!mqttClient || !mqttClient.connected) return { status: 'offline', topic };

  const payload = JSON.stringify({
    gasAlarmThreshold: alarmThreshold,
    gasClearThreshold: clearThreshold
  });
  await new Promise((resolve, reject) => {
    mqttClient.publish(topic, payload, { qos: 1, retain: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  console.log(`[MQTT] Published retained config to ${topic}: alarm=${alarmThreshold} clear=${clearThreshold}`);
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
  publishThresholdConfig,
  requireMqttConfig,
  stopMqttService,
  validateEdgeAlert
};
