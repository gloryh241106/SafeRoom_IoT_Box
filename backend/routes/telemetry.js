/**
 * Read-only telemetry API over MongoDB Time-Series data. Query field names are
 * mapped through an allow-list rather than interpolated directly into projections.
 *
 * Study map (NC-03): limit mode returns the latest full-resolution window;
 * maxPoints mode covers a requested range with bounded time buckets. Both
 * branches return chronological chart order.
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
    // Parse all untrusted query strings before constructing a MongoDB query.
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

    // Device equality is always present; time bounds are added only when supplied.
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
      // Anchor buckets at fromDate and count both inclusive endpoints so an
      // unaligned window cannot leak a maxPoints + 1 result.
      const fromMs = fromDate.getTime();
      const bucketMs = Math.max(1, Math.ceil((toDate.getTime() - fromMs + 1) / maxPoints));
      const pipeline = [
        { $match: query },
        { $sort: { timestamp: 1 } },
        {
          $group: {
            _id: {
              $floor: {
                $divide: [
                  { $subtract: [{ $toLong: '$timestamp' }, fromMs] },
                  bucketMs
                ]
              }
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
      // DESC + limit selects the newest N documents, not the oldest N in the range.
      let databaseQuery = SensorReading.find(query)
        .sort({ timestamp: -1 })
        .limit(parsedLimit);
      if (sensor) {
        // SENSOR_FIELDS is an allow-list, so user input never becomes an arbitrary projection path.
        databaseQuery = databaseQuery.select({
          timestamp: 1,
          deviceId: 1,
          [SENSOR_FIELDS.get(sensor)]: 1
        });
      }
      // Execute only after filters, ordering, limit, and optional projection are complete.
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
