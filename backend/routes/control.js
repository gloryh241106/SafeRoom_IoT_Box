const express = require('express');
const router = express.Router();
const { updateActuatorState, getCurrentActuatorStates } = require('../services/mockTelemetryGenerator');
const { setSystemArmed, isSystemArmed } = require('../services/anomalyEngine');

// POST /api/v1/control/actuator — Toggle actuators (fan, buzzer, alertLed)
router.post('/actuator', async (req, res) => {
  try {
    const { deviceId = 'safebox-01', actuator, state } = req.body;

    if (!actuator || state === undefined) {
      return res.status(400).json({ success: false, error: 'Actuator name and target state are required' });
    }

    if (actuator === 'systemArmed') {
      setSystemArmed(state);
      return res.json({
        success: true,
        message: `System armed state set to ${Boolean(state)}`,
        systemArmed: isSystemArmed()
      });
    }

    const updatedStates = updateActuatorState(actuator, state);

    console.log(`[Control API] Actuator '${actuator}' on device '${deviceId}' updated to ${state}`);

    /* =========================================================================
     * TEMPLATE: MQTT REAL PUBLISH COMMAND
     * (Uncomment when using real MQTT broker client)
     * =========================================================================
     * if (global.mqttClient) {
     *   const topic = `safebox/${deviceId}/control`;
     *   const payload = JSON.stringify({ actuator, state: state ? 'on' : 'off' });
     *   global.mqttClient.publish(topic, payload, { qos: 1 });
     * }
     * ========================================================================= */

    res.json({
      success: true,
      deviceId,
      actuator,
      state: Boolean(state),
      currentActuatorStates: updatedStates
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/control/status — Get actuator & armed states
router.get('/status', (req, res) => {
  res.json({
    success: true,
    actuators: getCurrentActuatorStates(),
    systemArmed: isSystemArmed()
  });
});

module.exports = router;
