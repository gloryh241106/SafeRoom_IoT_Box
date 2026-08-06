const express = require('express');
const router = express.Router();
const { getCurrentActuatorStates } = require('../services/mockTelemetryGenerator');
const { setSystemArmed, isSystemArmed, getThresholds, updateThresholds } = require('../services/anomalyEngine');
const { getMqttStatus, publishControlCommand } = require('../services/mqttService');

const ALLOWED_ACTUATORS = new Set(['fan', 'buzzer', 'alertLed']);

function parseActuatorState(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'on') return true;
  if (value === 'off') return false;
  throw new TypeError("state must be a boolean or the string 'on'/'off'");
}

// GET /api/v1/control/thresholds — Get current safety thresholds
router.get('/thresholds', (req, res) => {
  res.json({
    success: true,
    data: getThresholds()
  });
});

// POST /api/v1/control/thresholds — Update safety thresholds
router.post('/thresholds', (req, res) => {
  try {
    const updated = updateThresholds(req.body);
    res.json({
      success: true,
      message: 'Safety thresholds updated successfully',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/control/actuator — Toggle actuators (fan, buzzer, alertLed)
router.post('/actuator', async (req, res) => {
  try {
    const { deviceId = process.env.DEVICE_ID || 'safebox-01', actuator, state } = req.body;

    if (!actuator || state === undefined) {
      return res.status(400).json({ success: false, error: 'Actuator name and target state are required' });
    }

    if (actuator === 'systemArmed') {
      const targetState = parseActuatorState(state);
      setSystemArmed(targetState);
      return res.json({
        success: true,
        message: `System armed state set to ${targetState}`,
        systemArmed: isSystemArmed()
      });
    }

    if (!ALLOWED_ACTUATORS.has(actuator)) {
      return res.status(400).json({ success: false, error: `Unsupported actuator '${actuator}'` });
    }

    const targetState = parseActuatorState(state);
    const publishResult = await publishControlCommand(deviceId, actuator, targetState);

    res.json({
      success: true,
      deviceId,
      actuator,
      state: targetState,
      delivery: publishResult.status,
      currentActuatorStates: getCurrentActuatorStates()
    });
  } catch (err) {
    const status = err.code === 'MQTT_OFFLINE' ? 503 : err instanceof TypeError ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// GET /api/v1/control/status — Get actuator & armed states
router.get('/status', (req, res) => {
  const deviceId = req.query.deviceId || process.env.DEVICE_ID || 'safebox-01';
  res.json({
    success: true,
    actuators: getCurrentActuatorStates(),
    systemArmed: isSystemArmed(),
    mqtt: getMqttStatus(deviceId)
  });
});

module.exports = router;
