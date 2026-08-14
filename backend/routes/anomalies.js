/**
 * Query and acknowledgement routes for anomaly audit records. "Clear" is a
 * logical resolution update; safety evidence is retained instead of deleted.
 */
const express = require('express');
const router = express.Router();
const { AnomalyLog } = require('../models/Schemas');

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

// The legacy DELETE route name is retained for UI compatibility, but no records are erased.
router.delete('/clear-all', async (req, res) => {
  try {
    await AnomalyLog.updateMany(
      { resolved: false },
      { resolved: true, resolvedAt: new Date(), resolvedBy: 'Admin (Resolve All)' }
    );
    res.json({ success: true, message: 'All unresolved anomalies resolved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
