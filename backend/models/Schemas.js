const mongoose = require('mongoose');
const { Schema } = mongoose;

// 1. SensorReading Schema (Time-Series)
const SensorReadingSchema = new Schema({
  timestamp: { type: Date, required: true, default: Date.now },
  deviceId: { type: String, required: true, index: true },
  metrics: {
    temperature: { type: Number, required: true },
    humidity: { type: Number, required: true },
    gasLevel: { type: Number, required: true },
    gasRaw: { type: Number, default: null },
    gasValid: { type: Boolean, default: true },
    gasUnit: { type: String, enum: ['adc_index'], default: 'adc_index' },
    lightIntensity: { type: Number, default: null },
    motionDetected: { type: Boolean, required: true }
  },
  actuatorStates: {
    fanOn: { type: Boolean, required: true, default: false },
    buzzerActive: { type: Boolean, required: true, default: false },
    alertLedActive: { type: Boolean, required: true, default: false }
  }
}, {
  autoCreate: false,
  autoIndex: false
});

// 2. AnomalyLog Schema
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

// 3. User Schema
const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  settings: {
    emailEnabled: { type: Boolean, default: true },
    thresholds: {
      gasMax: { type: Number, default: 600 },
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
