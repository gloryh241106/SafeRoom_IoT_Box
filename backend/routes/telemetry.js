/**
 * Read-only telemetry API over MongoDB Time-Series data. Query field names are
 * mapped through an allow-list rather than interpolated directly into projections.
 */
const express = require('express');
const router = express.Router();
const { SensorReading } = require('../models/Schemas');

const SENSOR_FIELDS = new Map([
  ['temperature', 'metrics.temperature'],
  ['humidity', 'metrics.humidity'],
  ['gasLevel', 'metrics.gasLevel'],
  ['gasRaw', 'metrics.gasRaw'],
  ['motionDetected', 'metrics.motionDetected']
]);

function parseDateQuery(value, name) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be a valid date`);
  return date;
}

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

router.get('/historical', async (req, res) => {
  try {
    const deviceId = req.query.deviceId || process.env.DEVICE_ID || 'safebox-01';
    const { from, to, sensor, limit = 100 } = req.query;
    const maxPoints = req.query.maxPoints === undefined ? null : Number(req.query.maxPoints);
    const fromDate = parseDateQuery(from, 'from');
    const toDate = parseDateQuery(to, 'to');
    const parsedLimit = Number(limit);

    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 3600) {
      return res.status(400).json({ success: false, error: 'limit must be an integer between 1 and 3600' });
    }
    if (maxPoints !== null && (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 1000)) {
      return res.status(400).json({ success: false, error: 'maxPoints must be an integer between 1 and 1000' });
    }
    if (maxPoints !== null && (!fromDate || !toDate)) {
      return res.status(400).json({ success: false, error: 'maxPoints requires both from and to' });
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

    let readings;
    let subSampled = false;

    if (maxPoints !== null && fromDate && toDate) {
      // Time-uniform sub-sampling: split the window into <= maxPoints equal
      // buckets and keep the LAST sample of each bucket (most recent reading).
      const bucketMs = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / maxPoints));
      const pipeline = [
        { $match: query },
        { $sort: { timestamp: 1 } },
        {
          $group: {
            _id: {
              $subtract: [
                { $toLong: '$timestamp' },
                { $mod: [{ $toLong: '$timestamp' }, bucketMs] }
              ]
            },
            rep: { $last: '$$ROOT' }
          }
        },
        { $replaceRoot: { newRoot: '$rep' } },
        { $sort: { timestamp: 1 } }
      ];
      if (sensor) {
        pipeline.push({
          $project: { timestamp: 1, deviceId: 1, [SENSOR_FIELDS.get(sensor)]: 1 }
        });
      }
      readings = await SensorReading.aggregate(pipeline);
      subSampled = true;
    } else {
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
      readings = await databaseQuery;
      // MongoDB selects the newest bounded window efficiently; the API returns chart-friendly order.
      readings.reverse();
    }

    res.json({
      success: true,
      count: readings.length,
      subSampled,
      data: readings
    });
  } catch (err) {
    const status = err instanceof TypeError ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

module.exports = router;
