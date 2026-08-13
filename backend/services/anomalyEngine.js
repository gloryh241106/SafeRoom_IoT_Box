const { AnomalyLog } = require('../models/Schemas');
const { sendAlertEmail } = require('./emailService');

const WINDOW_SIZE = 30;
const DEDUPE_WINDOW_MS = Number(process.env.ANOMALY_DEDUPE_WINDOW_MS || 60_000);
const MIN_DELTA = { temperature: 1.0, humidity: 2.0 };
const NUMERIC_THRESHOLD_KEYS = ['gasMax', 'tempMax', 'tempMin', 'humidityMax', 'humidityMin', 'zScoreLimit'];
const DEFAULT_THRESHOLDS = Object.freeze({
  gasMax: 600,
  tempMax: 45,
  tempMin: 10,
  humidityMax: 85,
  humidityMin: 20,
  zScoreLimit: 3.0,
  isAutomatic: false
});

let systemArmedState = true;
let systemThresholds = { ...DEFAULT_THRESHOLDS };
let controlPublisher = async () => ({ status: 'unavailable' });

const rollingBuffers = new Map();
const anomalyDedupMap = new Map();

function bufferKey(deviceId, sensorType) {
  return `${deviceId}:${sensorType}`;
}

function getRollingBuffer(deviceId, sensorType) {
  const key = bufferKey(deviceId, sensorType);
  if (!rollingBuffers.has(key)) rollingBuffers.set(key, []);
  return rollingBuffers.get(key);
}

function meanAndStdDev(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

function evaluateZScore(deviceId, sensorType, value) {
  if (!Object.hasOwn(MIN_DELTA, sensorType)) {
    return { ready: false, zScore: null, isAnomaly: false };
  }
  if (!Number.isFinite(value)) throw new TypeError(`${sensorType} must be a finite number`);

  const buffer = getRollingBuffer(deviceId, sensorType);
  let result = { ready: false, zScore: null, mean: null, stdDev: null, isAnomaly: false };

  // Evaluate the new sample against the previous 30 readings, then roll it into the baseline.
  if (buffer.length === WINDOW_SIZE) {
    const { mean, stdDev } = meanAndStdDev(buffer);
    if (stdDev === 0) {
      result = { ready: true, zScore: 0, mean, stdDev, isAnomaly: false };
    } else {
      const zScore = (value - mean) / stdDev;
      const isAnomaly = Math.abs(zScore) > systemThresholds.zScoreLimit
        && Math.abs(value - mean) > MIN_DELTA[sensorType];
      result = { ready: true, zScore, mean, stdDev, isAnomaly };
    }
  }

  buffer.push(value);
  if (buffer.length > WINDOW_SIZE) buffer.shift();
  return result;
}

function setSystemArmed(state) {
  if (typeof state !== 'boolean') throw new TypeError('systemArmed state must be a boolean');
  systemArmedState = state;
}

function isSystemArmed() {
  return systemArmedState;
}

function getThresholds() {
  return { ...systemThresholds };
}

function updateThresholds(updates = {}) {
  const next = { ...systemThresholds };

  for (const key of NUMERIC_THRESHOLD_KEYS) {
    if (updates[key] === undefined) continue;
    const value = Number(updates[key]);
    if (!Number.isFinite(value)) throw new TypeError(`${key} must be a finite number`);
    next[key] = value;
  }

  if (updates.isAutomatic !== undefined) {
    if (typeof updates.isAutomatic !== 'boolean') throw new TypeError('isAutomatic must be a boolean');
    next.isAutomatic = updates.isAutomatic;
  }

  if (next.tempMin >= next.tempMax) throw new RangeError('tempMin must be lower than tempMax');
  if (next.humidityMin >= next.humidityMax) throw new RangeError('humidityMin must be lower than humidityMax');
  if (next.gasMax <= 0 || next.zScoreLimit <= 0) throw new RangeError('gasMax and zScoreLimit must be positive');

  systemThresholds = next;
  return getThresholds();
}

function setControlPublisher(publisher) {
  if (typeof publisher !== 'function') throw new TypeError('control publisher must be a function');
  controlPublisher = publisher;
}

function dedupeKey(candidate) {
  return `${candidate.deviceId}:${candidate.sensorType}:${candidate.triggerType}`;
}

async function executeActions(candidate) {
  const actionsTaken = ['LOGGED'];

  if (candidate.autoFan) {
    try {
      const result = await controlPublisher(candidate.deviceId, 'fan', true);
      actionsTaken.push(result.status === 'mocked' ? 'FAN_ON_SIMULATED' : 'FAN_ON_COMMAND_PUBLISHED');
    } catch (error) {
      actionsTaken.push(`FAN_ON_COMMAND_FAILED: ${error.message}`);
    }
  }

  if (candidate.activateAlertLed) {
    try {
      const result = await controlPublisher(candidate.deviceId, 'alertLed', true);
      actionsTaken.push(result.status === 'mocked' ? 'ALERT_LED_SIMULATED' : 'ALERT_LED_COMMAND_PUBLISHED');
    } catch (error) {
      actionsTaken.push(`ALERT_LED_COMMAND_FAILED: ${error.message}`);
    }
  }

  if (candidate.severity === 'HIGH' || candidate.severity === 'CRITICAL') {
    try {
      const emailResult = await sendAlertEmail(candidate);
      actionsTaken.push(`EMAIL_${emailResult.status.toUpperCase()}`);
    } catch (error) {
      actionsTaken.push(`EMAIL_FAILED: ${error.message}`);
    }
  }

  return actionsTaken;
}

async function createAnomalyIfNew(candidate) {
  const key = dedupeKey(candidate);
  const now = Date.now();
  const lastCreatedAt = anomalyDedupMap.get(key);
  if (lastCreatedAt !== undefined && now - lastCreatedAt < DEDUPE_WINDOW_MS) return null;

  // Reserve the key before asynchronous actions to prevent concurrent duplicate writes.
  anomalyDedupMap.set(key, now);
  try {
    const actionsTaken = await executeActions(candidate);
    return await AnomalyLog.create({
      deviceId: candidate.deviceId,
      timestamp: candidate.timestamp || new Date(),
      sensorType: candidate.sensorType,
      triggerType: candidate.triggerType,
      observedValue: candidate.observedValue,
      calculatedZScore: candidate.calculatedZScore ?? null,
      thresholdLimit: candidate.thresholdLimit,
      severity: candidate.severity,
      actionsTaken,
      resolved: false
    });
  } catch (error) {
    if (anomalyDedupMap.get(key) === now) anomalyDedupMap.delete(key);
    throw error;
  }
}

function hardThresholdCandidate(deviceId, timestamp, sensorType, observedValue, thresholdLimit, severity) {
  return {
    deviceId,
    timestamp,
    sensorType,
    triggerType: 'HARD_THRESHOLD_BREACH',
    observedValue,
    thresholdLimit,
    severity
  };
}

function buildGasCandidate({ deviceId, timestamp, metrics }) {
  if (!Number.isFinite(metrics.gasLevel)) return null;
  if (metrics.gasLevel <= systemThresholds.gasMax) return null;
  return hardThresholdCandidate(
    deviceId,
    timestamp,
    'gasLevel',
    metrics.gasLevel,
    systemThresholds.gasMax,
    'CRITICAL'
  );
}

function buildTemperatureCandidate({ deviceId, timestamp, metrics }, statistics) {
  const aboveMaximum = metrics.temperature > systemThresholds.tempMax;
  const belowMinimum = metrics.temperature < systemThresholds.tempMin;

  if (aboveMaximum || belowMinimum) {
    return {
      ...hardThresholdCandidate(
        deviceId,
        timestamp,
        'temperature',
        metrics.temperature,
        aboveMaximum ? systemThresholds.tempMax : systemThresholds.tempMin,
        'HIGH'
      ),
      autoFan: aboveMaximum
    };
  }

  if (!systemThresholds.isAutomatic || !statistics.isAnomaly) return null;
  return {
    deviceId,
    timestamp,
    sensorType: 'temperature',
    triggerType: 'Z_SCORE_EXCEEDED',
    observedValue: metrics.temperature,
    calculatedZScore: Number(statistics.zScore.toFixed(3)),
    thresholdLimit: systemThresholds.zScoreLimit,
    severity: 'HIGH',
    autoFan: metrics.temperature > statistics.mean
  };
}

function buildMotionCandidate({ deviceId, timestamp, metrics }) {
  if (!metrics.motionDetected || !systemArmedState) return null;
  return {
    ...hardThresholdCandidate(
      deviceId,
      timestamp,
      'motionDetected',
      true,
      'Armed system motion',
      'HIGH'
    ),
    activateAlertLed: true
  };
}

function buildHumidityCandidate({ deviceId, timestamp, metrics }, statistics) {
  const aboveMaximum = metrics.humidity > systemThresholds.humidityMax;
  const belowMinimum = metrics.humidity < systemThresholds.humidityMin;

  if (aboveMaximum || belowMinimum) {
    return hardThresholdCandidate(
      deviceId,
      timestamp,
      'humidity',
      metrics.humidity,
      aboveMaximum ? systemThresholds.humidityMax : systemThresholds.humidityMin,
      'MEDIUM'
    );
  }

  if (!systemThresholds.isAutomatic || !statistics.isAnomaly) return null;
  return {
    deviceId,
    timestamp,
    sensorType: 'humidity',
    triggerType: 'Z_SCORE_EXCEEDED',
    observedValue: metrics.humidity,
    calculatedZScore: Number(statistics.zScore.toFixed(3)),
    thresholdLimit: systemThresholds.zScoreLimit,
    severity: 'MEDIUM'
  };
}

async function processTelemetryForAnomalies(telemetryDoc) {
  const { deviceId, metrics } = telemetryDoc;
  const timestamp = telemetryDoc.timestamp || new Date();
  const context = { deviceId, timestamp, metrics };
  const temperatureStats = evaluateZScore(deviceId, 'temperature', metrics.temperature);
  const humidityStats = evaluateZScore(deviceId, 'humidity', metrics.humidity);
  // Hard rules remain active in every mode; automatic mode adds Z-score candidates.
  const candidates = [
    buildGasCandidate(context),
    buildTemperatureCandidate(context, temperatureStats),
    buildMotionCandidate(context),
    buildHumidityCandidate(context, humidityStats)
  ].filter(Boolean);

  const created = await Promise.all(candidates.map(createAnomalyIfNew));
  return created.filter(Boolean);
}

async function processEdgeAlert(alert) {
  return createAnomalyIfNew({
    deviceId: alert.deviceId,
    timestamp: alert.timestamp || new Date(),
    sensorType: alert.sensorType || 'gasLevel',
    triggerType: 'EDGE_SAFETY_TRIGGER',
    observedValue: alert.observedValue,
    thresholdLimit: alert.threshold,
    severity: 'CRITICAL'
  });
}

function resetAnomalyEngineForTests() {
  rollingBuffers.clear();
  anomalyDedupMap.clear();
  systemArmedState = true;
  systemThresholds = { ...DEFAULT_THRESHOLDS };
  controlPublisher = async () => ({ status: 'unavailable' });
}

module.exports = {
  DEDUPE_WINDOW_MS,
  MIN_DELTA,
  WINDOW_SIZE,
  evaluateZScore,
  getThresholds,
  isSystemArmed,
  processEdgeAlert,
  processTelemetryForAnomalies,
  resetAnomalyEngineForTests,
  setControlPublisher,
  setSystemArmed,
  updateThresholds
};
