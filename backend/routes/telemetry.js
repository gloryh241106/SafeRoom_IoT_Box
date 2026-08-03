const express = require('express');
const router = express.Router();
const { SensorReading } = require('../models/Schemas');

// GET /api/v1/telemetry/latest — Fetch latest sensor reading
router.get('/latest', async (req, res) => {
  try {
    const deviceId = req.query.deviceId || process.env.DEVICE_ID || 'safebox-01';
    const latestReading = await SensorReading.findOne({ deviceId }).sort({ timestamp: -1 });

    if (!latestReading) {
      return res.status(404).json({ success: false, error: 'No telemetry readings found' });
    }

    res.json({ success: true, data: latestReading });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/telemetry/historical — Fetch time-series historical data
router.get('/historical', async (req, res) => {
  try {
    const deviceId = req.query.deviceId || process.env.DEVICE_ID || 'safebox-01';
    const { from, to, sensor, limit = 100 } = req.query;

    const query = { deviceId };

    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }

    const readings = await SensorReading.find(query)
      .sort({ timestamp: 1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: readings.length,
      data: readings
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
