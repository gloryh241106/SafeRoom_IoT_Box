/**
 * Persistent data contracts shared by MQTT ingestion, REST queries, anomaly
 * logging, and user settings. Time-Series collection creation is intentionally
 * handled by timeSeriesService rather than by Mongoose's normal auto-create.
 *
 * Study map (NC-01/NC-03/NC-05): SensorReading is the persisted input fact,
 * AnomalyLog is the audit result, and User stores thresholds/email preference.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;
const {
  DEFAULT_GAS_ALERT_THRESHOLD,
  MAX_GAS_ALERT_THRESHOLD,
  MQ2_ADC_MAX,
  MQ2_ADC_MIN,
  MQ2_UNIT
} = require('../config/sensorContract');

// One document is the complete, atomic device snapshot published in a telemetry message.
const SensorReadingSchema = new Schema({
  timestamp: { type: Date, required: true, default: Date.now },
  deviceId: { type: String, required: true, index: true },
  metrics: {
    temperature: { type: Number, required: true },
    humidity: { type: Number, required: true },
    // gasLevel is a compatibility field name; its value remains a raw 12-bit ADC index.
    gasLevel: {
      type: Number,
      required: true,
      min: MQ2_ADC_MIN,
      max: MQ2_ADC_MAX,
      validate: { validator: Number.isInteger, message: 'gasLevel must be an integer ADC index' }
    },
    gasRaw: {
      type: Number,
      default: null,
      min: MQ2_ADC_MIN,
      max: MQ2_ADC_MAX,
      // null is retained for telemetry persisted before gasRaw was introduced.
      validate: {
        validator: (value) => value == null || Number.isInteger(value),
        message: 'gasRaw must be an integer ADC index'
      }
    },
    // Device-reported live edge alarm threshold; null on legacy firmware/documents.
    gasAlarmThreshold: {
      type: Number,
      default: null,
      min: 1,
      max: MAX_GAS_ALERT_THRESHOLD,
      validate: {
        validator: (value) => value == null || Number.isInteger(value),
        message: 'gasAlarmThreshold must be an integer ADC index'
      }
    },
    gasValid: { type: Boolean, default: true },
    gasUnit: { type: String, enum: [MQ2_UNIT], default: MQ2_UNIT },
    motionDetected: { type: Boolean, required: true }
  },
  actuatorStates: {
    fanOn: { type: Boolean, required: true, default: false },
    buzzerActive: { type: Boolean, required: true, default: false },
    alertLedActive: { type: Boolean, required: true, default: false },
    // Device-reported local MQ2 safety override holding buzzer/LED outputs.
    gasAlarmActive: { type: Boolean, default: false }
  }
}, {
  // A regular Mongoose collection would not have the required MongoDB Time-Series options.
  autoCreate: false,
  autoIndex: false
});

// Anomaly records retain both the decision input and every attempted side effect for auditability.
const AnomalyLogSchema = new Schema({
  deviceId: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  sensorType: { 
    type: String, 
    enum: ['temperature', 'humidity', 'gasLevel', 'motionDetected'],
    required: true 
  },
  triggerType: { 
    type: String, 
    enum: ['Z_SCORE_EXCEEDED', 'HARD_THRESHOLD_BREACH', 'EDGE_SAFETY_TRIGGER'],
    required: true 
  },
  observedValue: { type: Schema.Types.Mixed, required: true },
  calculatedZScore: { type: Number, default: null },
  thresholdLimit: { type: Schema.Types.Mixed, required: true },
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true },
  actionsTaken: [{ type: String }],
  resolved: { type: Boolean, default: false },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: null }
});

// Thresholds are stored per profile, while the current runtime engine holds one process-global set.
const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  settings: {
    emailEnabled: { type: Boolean, default: true },
    thresholds: {
      gasMax: {
        type: Number,
        default: DEFAULT_GAS_ALERT_THRESHOLD,
        min: 1,
        max: MAX_GAS_ALERT_THRESHOLD,
        validate: { validator: Number.isInteger, message: 'gasMax must be an integer ADC index' }
      },
      tempMax: { type: Number, default: 45 },
      tempMin: { type: Number, default: 10 },
      humidityMax: { type: Number, default: 85 },
      humidityMin: { type: Number, default: 20 },
      zScoreLimit: { type: Number, default: 3.0 },
      isAutomatic: { type: Boolean, default: false }
    }
  },
  createdAt: { type: Date, default: Date.now }
});

const SensorReading = mongoose.model('SensorReading', SensorReadingSchema, 'sensor_readings');
const AnomalyLog = mongoose.model('AnomalyLog', AnomalyLogSchema, 'anomaly_logs');
const User = mongoose.model('User', UserSchema, 'users');

module.exports = { SensorReading, AnomalyLog, User };
