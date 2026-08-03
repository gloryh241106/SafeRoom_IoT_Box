const express = require('express');
const router = express.Router();
const { AnomalyLog } = require('../models/Schemas');

// GET /api/v1/anomalies — Fetch anomaly logs with optional filters
router.get('/', async (req, res) => {
  try {
    const { status, severity, sensorType, limit = 50 } = req.query;
    const query = {};

    if (status === 'unresolved') query.resolved = false;
    if (status === 'resolved') query.resolved = true;
    if (severity) query.severity = severity.toUpperCase();
    if (sensorType) query.sensorType = sensorType;

    const anomalies = await AnomalyLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: anomalies.length,
      data: anomalies
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/v1/anomalies/:id/resolve — Mark anomaly log as resolved
router.patch('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolvedBy = 'admin' } = req.body;

    const anomaly = await AnomalyLog.findByIdAndUpdate(
      id,
      {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy
      },
      { new: true }
    );

    if (!anomaly) {
      return res.status(404).json({ success: false, error: 'Anomaly log entry not found' });
    }

    res.json({ success: true, data: anomaly });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
