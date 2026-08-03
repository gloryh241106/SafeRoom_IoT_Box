/**
 * SafeRoom IoT Box — Anomaly Engine
 * 
 * ACTIVE ENGINE: Value bound threshold checking on incoming metrics.
 * TEMPLATE: Commented rolling window Z-Score engine template (|Z| > 3.0) for continuous variables (Temp, Humidity).
 */

const { AnomalyLog } = require('../models/Schemas');
const { sendAlertEmail } = require('./emailService');

// System armed state flag (can be toggled via API)
let systemArmedState = true;

function setSystemArmed(state) {
  systemArmedState = Boolean(state);
}

function isSystemArmed() {
  return systemArmedState;
}

/**
 * Checks telemetry metric bounds and creates anomaly logs when thresholds are breached.
 */
async function processTelemetryForAnomalies(telemetryDoc) {
  const { deviceId, metrics, timestamp } = telemetryDoc;
  const anomaliesDetected = [];

  // 1. Gas / Smoke Threshold Check (MQ2)
  if (metrics.gasLevel > 600) {
    const anomaly = await AnomalyLog.create({
      deviceId,
      timestamp: timestamp || new Date(),
      sensorType: 'gasLevel',
      triggerType: 'HARD_THRESHOLD_BREACH',
      observedValue: metrics.gasLevel,
      calculatedZScore: null,
      thresholdLimit: 600,
      severity: 'CRITICAL',
      actionsTaken: ['LOCAL_BUZZER_ACTIVE', 'LOCAL_ALERT_LED', 'EMAIL_SENT'],
      resolved: false
    });
    anomaliesDetected.push(anomaly);
    await sendAlertEmail({
      deviceId,
      sensorType: 'gasLevel',
      severity: 'CRITICAL',
      observedValue: metrics.gasLevel,
      thresholdLimit: 600,
      timestamp
    });
  }

  // 2. Temperature Threshold Check (DHT22)
  if (metrics.temperature > 45 || metrics.temperature < 10) {
    const anomaly = await AnomalyLog.create({
      deviceId,
      timestamp: timestamp || new Date(),
      sensorType: 'temperature',
      triggerType: 'HARD_THRESHOLD_BREACH',
      observedValue: metrics.temperature,
      calculatedZScore: null,
      thresholdLimit: metrics.temperature > 45 ? 45 : 10,
      severity: 'HIGH',
      actionsTaken: ['FAN_AUTO_TRIGGER', 'EMAIL_SENT'],
      resolved: false
    });
    anomaliesDetected.push(anomaly);
    await sendAlertEmail({
      deviceId,
      sensorType: 'temperature',
      severity: 'HIGH',
      observedValue: `${metrics.temperature}°C`,
      thresholdLimit: metrics.temperature > 45 ? '45°C' : '10°C',
      timestamp
    });
  }

  // 3. Motion Detection Check (PIR HC-SR501 when System Armed)
  if (metrics.motionDetected && systemArmedState) {
    const anomaly = await AnomalyLog.create({
      deviceId,
      timestamp: timestamp || new Date(),
      sensorType: 'motionDetected',
      triggerType: 'HARD_THRESHOLD_BREACH',
      observedValue: true,
      calculatedZScore: null,
      thresholdLimit: 'Armed System Motion',
      severity: 'LOW',
      actionsTaken: ['ALERT_LED_ACTIVE', 'LOGGED'],
      resolved: false
    });
    anomaliesDetected.push(anomaly);
  }

  // 4. Humidity Threshold Check (DHT22)
  if (metrics.humidity > 85 || metrics.humidity < 20) {
    const anomaly = await AnomalyLog.create({
      deviceId,
      timestamp: timestamp || new Date(),
      sensorType: 'humidity',
      triggerType: 'HARD_THRESHOLD_BREACH',
      observedValue: metrics.humidity,
      calculatedZScore: null,
      thresholdLimit: metrics.humidity > 85 ? 85 : 20,
      severity: 'MEDIUM',
      actionsTaken: ['LOGGED'],
      resolved: false
    });
    anomaliesDetected.push(anomaly);
  }

  return anomaliesDetected;
}

/* =========================================================================
 * TEMPLATE: ROLLING WINDOW Z-SCORE ANOMALY DETECTOR (|Z| > 3.0)
 * (Uncomment to replace/extend bound checking with statistical Z-score)
 * =========================================================================
 * 
 * const rollingBuffers = {
 *   temperature: [],
 *   humidity: []
 * };
 * const WINDOW_SIZE = 30;
 * const MIN_DELTA = { temperature: 1.5, humidity: 3.0 }; // Filter physical noise
 * 
 * function computeZScore(sensorType, value) {
 *   const buffer = rollingBuffers[sensorType];
 *   if (!buffer) return { zScore: null, isAnomaly: false };
 *   
 *   buffer.push(value);
 *   if (buffer.length > WINDOW_SIZE) buffer.shift();
 *   
 *   // Cold start safeguard: need at least 30 samples for Z-score
 *   if (buffer.length < WINDOW_SIZE) return { zScore: null, isAnomaly: false };
 *   
 *   const mean = buffer.reduce((acc, val) => acc + val, 0) / buffer.length;
 *   const variance = buffer.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / buffer.length;
 *   const stdDev = Math.sqrt(variance);
 *   
 *   if (stdDev === 0) return { zScore: 0, isAnomaly: false };
 *   
 *   const zScore = (value - mean) / stdDev;
 *   const absDeviation = Math.abs(value - mean);
 *   const isAnomaly = Math.abs(zScore) > 3.0 && absDeviation > MIN_DELTA[sensorType];
 *   
 *   return { zScore, mean, stdDev, isAnomaly };
 * }
 * ========================================================================= */

module.exports = {
  processTelemetryForAnomalies,
  setSystemArmed,
  isSystemArmed
};
