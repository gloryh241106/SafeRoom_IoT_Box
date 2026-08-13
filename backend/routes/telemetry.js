const express = require('express');
const router = express.Router();
const { SensorReading } = require('../models/Schemas');

const SENSOR_FIELDS = new Map([
  ['temperature', 'metrics.temperature'],
  ['humidity', 'metrics.humidity'],
  ['gasLevel', 'metrics.gasLevel'],
  ['lightIntensity', 'metrics.lightIntensity'],
  ['motionDetected', 'metrics.motionDetected']
]);

function parseDateQuery(value, name) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be a valid date`);
  return date;
}

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
    const fromDate = parseDateQuery(from, 'from');
    const toDate = parseDateQuery(to, 'to');
    const parsedLimit = Number(limit);

    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
      return res.status(400).json({ success: false, error: 'limit must be an integer between 1 and 1000' });
    }
    if (sensor && !SENSOR_FIELDS.has(sensor)) {
      return res.status(400).json({ success: false, error: `Unsupported sensor '${sensor}'` });
    }
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ success: false, error: 'from must be earlier than or equal to to' });
    }

    const query = { deviceId };

    if (fromDate || toDate) {
      query.timestamp = {};
      if (fromDate) query.timestamp.$gte = fromDate;
      if (toDate) query.timestamp.$lte = toDate;
    }

    let databaseQuery = SensorReading.find(query)
      .sort({ timestamp: -1 })
      .limit(parsedLimit);
    if (sensor) {
      databaseQuery = databaseQuery.select({
        timestamp: 1,
        deviceId: 1,
        [SENSOR_FIELDS.get(sensor)]: 1
      });
    }
    const readings = await databaseQuery;
    readings.reverse();

    res.json({
      success: true,
      count: readings.length,
      data: readings
    });
  } catch (err) {
    const status = err instanceof TypeError ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

module.exports = router;
