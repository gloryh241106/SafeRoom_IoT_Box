const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const { startMockTelemetryGenerator } = require('./services/mockTelemetryGenerator');

const { router: authRouter } = require('./routes/auth');
const telemetryRouter = require('./routes/telemetry');
const controlRouter = require('./routes/control');
const anomaliesRouter = require('./routes/anomalies');
const chatbotRouter = require('./routes/chatbot');
const usersRouter = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safebox';

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
  res.json({ status: 'ok', timestamp: new Date(), service: 'safebox-backend' });
});

// MongoDB Connection Boot
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log(`[MongoDB] Connected successfully to ${MONGO_URI}`);

    // Start mock telemetry hardware simulation
    startMockTelemetryGenerator(process.env.DEVICE_ID || 'safebox-01');

    app.listen(PORT, () => {
      console.log(`[Backend Server] Running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(`[MongoDB] Connection error:`, err.message);
    process.exit(1);
  });
