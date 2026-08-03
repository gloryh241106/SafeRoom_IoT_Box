/**
 * Mock Telemetry Generator & Hardware Simulation
 * 
 * Generates realistic ESP32 sensor telemetry every 2 seconds, persists to MongoDB,
 * and passes metrics to the Anomaly Detection Engine.
 * 
 * Also contains a commented template for real MQTT EMQX Broker integration.
 */

const { SensorReading } = require('../models/Schemas');
const { processTelemetryForAnomalies } = require('./anomalyEngine');

let mockIntervalId = null;
let currentActuatorStates = {
  fanOn: false,
  buzzerActive: false,
  alertLedActive: false
};

function updateActuatorState(actuator, state) {
  if (actuator === 'fan') currentActuatorStates.fanOn = Boolean(state);
  if (actuator === 'buzzer') currentActuatorStates.buzzerActive = Boolean(state);
  if (actuator === 'alertLed') currentActuatorStates.alertLedActive = Boolean(state);
  return currentActuatorStates;
}

function startMockTelemetryGenerator(deviceId = 'safebox-01') {
  if (mockIntervalId) return;

  console.log(`[MockTelemetry] Starting hardware simulation for ${deviceId} (2s tick)...`);

  let tempBase = 28.0;
  let humBase = 62.0;
  let gasBase = 180;

  mockIntervalId = setInterval(async () => {
    try {
      // Simulate realistic physical sensor micro-fluctuations
      tempBase += (Math.random() - 0.5) * 0.4;
      humBase += (Math.random() - 0.5) * 0.6;
      gasBase += (Math.random() - 0.5) * 5;

      // Keep within plausible hardware bounds
      const temperature = parseFloat(Math.max(15, Math.min(50, tempBase)).toFixed(1));
      const humidity = parseFloat(Math.max(30, Math.min(95, humBase)).toFixed(1));
      const gasLevel = Math.round(Math.max(50, Math.min(1000, gasBase)));
      const motionDetected = Math.random() < 0.05; // 5% chance of motion trigger

      const readingDoc = await SensorReading.create({
        deviceId,
        timestamp: new Date(),
        metrics: {
          temperature,
          humidity,
          gasLevel,
          motionDetected
        },
        actuatorStates: { ...currentActuatorStates }
      });

      // Run anomaly evaluation
      await processTelemetryForAnomalies(readingDoc);

    } catch (err) {
      console.error('[MockTelemetry] Error generating tick:', err.message);
    }
  }, 2000);
}

/* =========================================================================
 * TEMPLATE: REAL MQTT BROKER CONNECTION (EMQX Cloud Serverless)
 * (Uncomment and configure credentials to connect to real ESP32 hardware)
 * =========================================================================
 * 
 * const mqtt = require('mqtt');
 * 
 * function initRealMqttClient() {
 *   const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtts://broker.emqx.io:8883';
 *   const options = {
 *     clientId: `safebox_backend_${Math.random().toString(16).substring(2, 8)}`,
 *     username: process.env.MQTT_USERNAME || 'safebox_admin',
 *     password: process.env.MQTT_PASSWORD || 'secret123',
 *     clean: true,
 *     rejectUnauthorized: true
 *   };
 * 
 *   const client = mqtt.connect(brokerUrl, options);
 * 
 *   client.on('connect', () => {
 *     console.log('[MQTT] Connected to EMQX Cloud Broker');
 *     client.subscribe('safebox/+/telemetry', { qos: 0 });
 *     client.subscribe('safebox/+/alerts', { qos: 1 });
 *     client.subscribe('safebox/+/status', { qos: 1 });
 *   });
 * 
 *   client.on('message', async (topic, message) => {
 *     try {
 *       const payload = JSON.parse(message.toString());
 *       console.log(`[MQTT] Incoming on ${topic}:`, payload);
 *       
 *       if (topic.endsWith('/telemetry')) {
 *         const doc = await SensorReading.create(payload);
 *         await processTelemetryForAnomalies(doc);
 *       } else if (topic.endsWith('/alerts')) {
 *         // Handle ESP32 edge safety alerts
 *       }
 *     } catch (err) {
 *       console.error('[MQTT] Message parsing error:', err.message);
 *     }
 *   });
 * 
 *   return client;
 * }
 * 
 * function publishControlCommand(client, deviceId, actuator, state) {
 *   const topic = `safebox/${deviceId}/control`;
 *   const payload = JSON.stringify({ actuator, state: state ? 'on' : 'off' });
 *   client.publish(topic, payload, { qos: 1 });
 * }
 * ========================================================================= */

module.exports = {
  startMockTelemetryGenerator,
  updateActuatorState,
  getCurrentActuatorStates: () => ({ ...currentActuatorStates })
};
