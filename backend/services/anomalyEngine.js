/**
 * SafeRoom IoT Box — Anomaly Engine
 * 
 * ACTIVE ENGINE: Configurable Manual Bounds & Rolling Window Z-Score Engine.
 * Supports switching between Manual Bounds and Statistical Z-Score Detection (|Z| > zScoreLimit).
 */

const { AnomalyLog } = require('../models/Schemas');
const { sendAlertEmail } = require('./emailService');

// System armed state flag & editable safety thresholds
let systemArmedState = true;
let systemThresholds = {
  gasMax: 600,
  tempMax: 45,
  tempMin: 10,
  humidityMax: 85,
  humidityMin: 20,
  zScoreLimit: 3.0,
  isAutomatic: false // false = manual bounds, true = statistical Z-Score mode
};

// Rolling buffers for Z-Score statistical anomaly engine
const rollingBuffers = {
  temperature: [],
  humidity: []
};
const WINDOW_SIZE = 30;
const MIN_DELTA = { temperature: 1.0, humidity: 2.0 };

function setSystemArmed(state) {
  systemArmedState = Boolean(state);
}

function isSystemArmed() {
  return systemArmedState;
}

function getThresholds() {
  return systemThresholds;
}

function updateThresholds(newThresholds) {
  systemThresholds = {
    ...systemThresholds,
    gasMax: newThresholds.gasMax !== undefined ? Number(newThresholds.gasMax) : systemThresholds.gasMax,
    tempMax: newThresholds.tempMax !== undefined ? Number(newThresholds.tempMax) : systemThresholds.tempMax,
    tempMin: newThresholds.tempMin !== undefined ? Number(newThresholds.tempMin) : systemThresholds.tempMin,
    humidityMax: newThresholds.humidityMax !== undefined ? Number(newThresholds.humidityMax) : systemThresholds.humidityMax,
    humidityMin: newThresholds.humidityMin !== undefined ? Number(newThresholds.humidityMin) : systemThresholds.humidityMin,
    zScoreLimit: newThresholds.zScoreLimit !== undefined ? Number(newThresholds.zScoreLimit) : systemThresholds.zScoreLimit,
    isAutomatic: newThresholds.isAutomatic !== undefined ? Boolean(newThresholds.isAutomatic) : systemThresholds.isAutomatic,
  };
  return systemThresholds;
}

/**
 * Computes Z-Score statistical anomaly over N=30 rolling sample buffer.
 */
function computeZScore(sensorType, value) {
  const buffer = rollingBuffers[sensorType];
  if (!buffer) return { zScore: null, isAnomaly: false };
  
  buffer.push(value);
  if (buffer.length > WINDOW_SIZE) buffer.shift();
  
  // Need at least 5 samples to compute standard deviation
  if (buffer.length < 5) return { zScore: null, isAnomaly: false };
  
  const mean = buffer.reduce((acc, val) => acc + val, 0) / buffer.length;
  const variance = buffer.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / buffer.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return { zScore: 0, mean, stdDev, isAnomaly: false };
  
  const zScore = (value - mean) / stdDev;
  const absDeviation = Math.abs(value - mean);
  const isAnomaly = Math.abs(zScore) > systemThresholds.zScoreLimit && absDeviation > MIN_DELTA[sensorType];
  
  return { zScore, mean, stdDev, isAnomaly };
}

/**
 * Checks telemetry metric bounds and creates anomaly logs when thresholds are breached.
 */
async function processTelemetryForAnomalies(telemetryDoc) {
  const { deviceId, metrics, timestamp } = telemetryDoc;
  const anomaliesDetected = [];

  // 1. Gas / Smoke Threshold Check (MQ2 - Always hard bound safety trigger)
  if (metrics.gasLevel > systemThresholds.gasMax) {
    const anomaly = await AnomalyLog.create({
      deviceId,
      timestamp: timestamp || new Date(),
      sensorType: 'gasLevel',
      triggerType: 'HARD_THRESHOLD_BREACH',
      observedValue: metrics.gasLevel,
      calculatedZScore: null,
      thresholdLimit: systemThresholds.gasMax,
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
      thresholdLimit: systemThresholds.gasMax,
      timestamp
    });
  }

  // 2. Temperature Check (DHT22 - Manual bounds or Z-Score Automatic mode)
  if (systemThresholds.isAutomatic) {
    const { zScore, isAnomaly } = computeZScore('temperature', metrics.temperature);
    if (isAnomaly) {
      const anomaly = await AnomalyLog.create({
        deviceId,
        timestamp: timestamp || new Date(),
        sensorType: 'temperature',
        triggerType: 'Z_SCORE_EXCEEDED',
        observedValue: metrics.temperature,
        calculatedZScore: Number(zScore.toFixed(2)),
        thresholdLimit: `Z > ${systemThresholds.zScoreLimit}`,
        severity: 'HIGH',
        actionsTaken: ['FAN_AUTO_TRIGGER', 'EMAIL_SENT'],
        resolved: false
      });
      anomaliesDetected.push(anomaly);
      await sendAlertEmail({
        deviceId,
        sensorType: 'temperature',
        severity: 'HIGH',
        observedValue: `${metrics.temperature}°C (Z=${zScore.toFixed(2)})`,
        thresholdLimit: `Z > ${systemThresholds.zScoreLimit}`,
        timestamp
      });
    }
  } else {
    if (metrics.temperature > systemThresholds.tempMax || metrics.temperature < systemThresholds.tempMin) {
      const isHighBreach = metrics.temperature > systemThresholds.tempMax;
      const limitVal = isHighBreach ? systemThresholds.tempMax : systemThresholds.tempMin;
      const anomaly = await AnomalyLog.create({
        deviceId,
        timestamp: timestamp || new Date(),
        sensorType: 'temperature',
        triggerType: 'HARD_THRESHOLD_BREACH',
        observedValue: metrics.temperature,
        calculatedZScore: null,
        thresholdLimit: limitVal,
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
        thresholdLimit: `${limitVal}°C`,
        timestamp
      });
    }
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

  // 4. Humidity Check (DHT22 - Manual bounds or Z-Score Automatic mode)
  if (systemThresholds.isAutomatic) {
    const { zScore, isAnomaly } = computeZScore('humidity', metrics.humidity);
    if (isAnomaly) {
      const anomaly = await AnomalyLog.create({
        deviceId,
        timestamp: timestamp || new Date(),
        sensorType: 'humidity',
        triggerType: 'Z_SCORE_EXCEEDED',
        observedValue: metrics.humidity,
        calculatedZScore: Number(zScore.toFixed(2)),
        thresholdLimit: `Z > ${systemThresholds.zScoreLimit}`,
        severity: 'MEDIUM',
        actionsTaken: ['LOGGED'],
        resolved: false
      });
      anomaliesDetected.push(anomaly);
    }
  } else {
    if (metrics.humidity > systemThresholds.humidityMax || metrics.humidity < systemThresholds.humidityMin) {
      const isHighBreach = metrics.humidity > systemThresholds.humidityMax;
      const limitVal = isHighBreach ? systemThresholds.humidityMax : systemThresholds.humidityMin;
      const anomaly = await AnomalyLog.create({
        deviceId,
        timestamp: timestamp || new Date(),
        sensorType: 'humidity',
        triggerType: 'HARD_THRESHOLD_BREACH',
        observedValue: metrics.humidity,
        calculatedZScore: null,
        thresholdLimit: limitVal,
        severity: 'MEDIUM',
        actionsTaken: ['LOGGED'],
        resolved: false
      });
      anomaliesDetected.push(anomaly);
    }
  }

  return anomaliesDetected;
}

module.exports = {
  processTelemetryForAnomalies,
  setSystemArmed,
  isSystemArmed,
  getThresholds,
  updateThresholds
};
