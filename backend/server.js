const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const { startMockTelemetryGenerator, stopMockTelemetryGenerator } = require('./services/mockTelemetryGenerator');
const { initializeEmailService } = require('./services/emailService');
const { setControlPublisher } = require('./services/anomalyEngine');
const {
  getMqttStatus,
  initializeMqttService,
  isMockHardware,
  publishControlCommand,
  stopMqttService
} = require('./services/mqttService');
const { ensureSensorReadingsTimeSeries } = require('./services/timeSeriesService');

const { router: authRouter } = require('./routes/auth');
const telemetryRouter = require('./routes/telemetry');
const controlRouter = require('./routes/control');
const anomaliesRouter = require('./routes/anomalies');
const chatbotRouter = require('./routes/chatbot');
const usersRouter = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safebox';
let httpServer = null;

// Global Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Route Mounting
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/telemetry', telemetryRouter);
app.use('/api/v1/control', controlRouter);
app.use('/api/v1/anomalies', anomaliesRouter);
app.use('/api/v1/chatbot', chatbotRouter);
app.use('/api/v1/users', usersRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    service: 'safebox-backend',
    mqtt: getMqttStatus(process.env.DEVICE_ID || 'safebox-01')
  });
});

async function startServer() {
  await mongoose.connect(MONGO_URI);
  console.log('[MongoDB] Connected successfully.');
  const collectionStatus = await ensureSensorReadingsTimeSeries(mongoose.connection.db);
  console.log(
    `[MongoDB] ${collectionStatus.collection} verified as Time Series with ${collectionStatus.expireAfterSeconds}s retention.`
  );

  const emailStatus = await initializeEmailService({
    verify: String(process.env.SMTP_VERIFY_ON_STARTUP).toLowerCase() === 'true'
  });
  console.log(`[Email] Alerts ${emailStatus.enabled ? 'enabled' : 'disabled'}.`);

  setControlPublisher(publishControlCommand);
  initializeMqttService();
  if (isMockHardware()) {
    startMockTelemetryGenerator(process.env.DEVICE_ID || 'safebox-01');
  }

  await new Promise((resolve) => {
    httpServer = app.listen(PORT, () => {
      console.log(`[Backend Server] Running on http://localhost:${PORT}`);
      resolve();
    });
  });
  return httpServer;
}

async function stopServer() {
  stopMockTelemetryGenerator();
  await stopMqttService();
  if (httpServer) {
    await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    httpServer = null;
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[Backend] Startup failed:', err.message);
    process.exit(1);
  });
}

module.exports = { app, startServer, stopServer };
