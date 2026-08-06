/**
 * Mock Telemetry Generator & Hardware Simulation
 * 
 * Generates realistic ESP32 sensor telemetry every 2 seconds, persists to MongoDB,
 * and passes metrics to the Anomaly Detection Engine.
 * 
 */

const { ingestTelemetry } = require('./telemetryService');

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

      await ingestTelemetry({
        deviceId,
        timestamp: new Date(),
        metrics: {
          temperature,
          humidity,
          gasLevel,
          motionDetected
        },
        actuatorStates: { ...currentActuatorStates }
      }, deviceId);

    } catch (err) {
      console.error('[MockTelemetry] Error generating tick:', err.message);
    }
  }, 2000);
}

function stopMockTelemetryGenerator() {
  if (!mockIntervalId) return;
  clearInterval(mockIntervalId);
  mockIntervalId = null;
}

module.exports = {
  startMockTelemetryGenerator,
  stopMockTelemetryGenerator,
  updateActuatorState,
  getCurrentActuatorStates: () => ({ ...currentActuatorStates })
};
