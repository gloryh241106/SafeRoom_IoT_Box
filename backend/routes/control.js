/**
 * Authenticated runtime control API. Fan commands cross the MQTT boundary;
 * the buzzer and alert LED are edge-only outputs driven by the local gas
 * alarm, so they are not remotely controllable. Armed state and thresholds
 * remain backend process state. While the system is DISARMED, physical
 * actuator commands are rejected with 403; only the systemArmed toggle
 * itself is accepted so the system can be re-armed from the dashboard.
 *
 * Study map (CB-03): this route is the trust boundary between authenticated
 * HTTP input and a physical MQTT command. Validate before crossing that boundary.
 */
const express = require('express');
const router = express.Router();
const { SensorReading } = require('../models/Schemas');
const { getCurrentActuatorStates } = require('../services/actuatorStateService');
const { setSystemArmed, isSystemArmed, getThresholds, loadUserThresholds, updateThresholds } = require('../services/anomalyEngine');
const { getMqttStatus, publishControlCommand, publishThresholdConfig } = require('../services/mqttService');
const { getFirmwareGasThresholds, setFirmwareGasThreshold } = require('../services/firmwareConfigService');

/**
 * Resolves the target device for MQTT pushes. Telemetry identity is
 * authoritative: config/control must reach the device that actually reports,
 * so an env DEVICE_ID mismatch cannot silently drop messages.
 */
async function resolveDeviceId(explicitDeviceId) {
  if (explicitDeviceId) return explicitDeviceId;
  const latestReading = await SensorReading.findOne({}).sort({ timestamp: -1 });
  if (latestReading?.deviceId) return latestReading.deviceId;
  return process.env.DEVICE_ID || 'safebox-01';
}

function parseActuatorState(value) {
  // React sends booleans; accepting on/off also keeps the REST contract testable by hand.
  if (typeof value === 'boolean') return value;
  if (value === 'on') return true;
  if (value === 'off') return false;
  throw new TypeError("state must be a boolean or the string 'on'/'off'");
}

router.get('/thresholds', async (req, res) => {
  try {
    const data = await loadUserThresholds(req.user?.id);
    // Report the edge value currently compiled into the ESP32 so the UI can
    // show what the firmware will actually act on after a rebuild.
    const firmware = getFirmwareGasThresholds();
    res.json({
      success: true,
      data: {
        ...data,
        firmwareGasEdgeThreshold: firmware?.alarm ?? data.gasMax
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/thresholds', async (req, res) => {
  try {
    const updated = updateThresholds(req.body, req.user?.id);
    // The saved value becomes the ESP32 edge threshold in config.h (reboot /
    // reflash default) and is also pushed live over MQTT so the device applies
    // it without a reflash. Both steps are best-effort and never fail the save.
    const firmware = setFirmwareGasThreshold(updated.gasMax);
    const alarm = firmware?.alarm ?? updated.gasMax;
    const clear = firmware?.clear ?? Math.max(0, updated.gasMax - 100);
    const deviceId = await resolveDeviceId(req.body.deviceId);
    let configDelivery = 'unavailable';
    try {
      configDelivery = (await publishThresholdConfig(deviceId, alarm, clear)).status;
    } catch (err) {
      configDelivery = `failed: ${err.message}`;
    }
    res.json({
      success: true,
      message: 'Safety thresholds updated successfully',
      data: {
        ...updated,
        firmwareGasEdgeThreshold: alarm,
        configDelivery
      }
    });
  } catch (err) {
    const status = err instanceof TypeError || err instanceof RangeError ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.post('/actuator', async (req, res) => {
  try {
    // DEVICE_ID is only a fallback; the dashboard normally sends the latest device ID.
    const { deviceId = process.env.DEVICE_ID || 'safebox-01', actuator, state } = req.body;

    // Test state against undefined so the valid boolean false is not rejected.
    if (!actuator || state === undefined) {
      return res.status(400).json({ success: false, error: 'Actuator name and target state are required' });
    }

    if (actuator === 'systemArmed') {
      // Armed state is backend process state, not a physical MQTT actuator.
      // It gates anomaly creation and remote fan commands, but never local gas safety.
      const targetState = parseActuatorState(state);
      // This changes process-local anomaly/control policy and publishes no MQTT message.
      setSystemArmed(targetState);
      return res.json({
        success: true,
        message: `System armed state set to ${targetState}`,
        systemArmed: isSystemArmed()
      });
    }

    if (actuator !== 'fan') {
      // Buzzer and alert LED are intentionally absent because gas safety owns them locally.
      return res.status(400).json({ success: false, error: `Unsupported actuator '${actuator}'` });
    }

    if (!isSystemArmed()) {
      // Enforce the gate server-side; a caller can bypass the frontend button state.
      return res.status(403).json({ success: false, error: 'System is DISARMED; remote actuator control is disabled' });
    }

    // Normalize the REST value before crossing into the stricter MQTT service contract.
    const targetState = parseActuatorState(state);
    // Await broker publication so an offline broker becomes an HTTP error, not false success.
    const publishResult = await publishControlCommand(deviceId, actuator, targetState);

    // Return both delivery status and the current optimistic snapshot for observability.
    res.json({
      success: true,
      deviceId,
      actuator,
      state: targetState,
      delivery: publishResult.status,
      currentActuatorStates: getCurrentActuatorStates()
    });
  } catch (err) {
    // Expected boundary errors get actionable HTTP codes; unexpected failures stay 500.
    const status = err.code === 'MQTT_OFFLINE' ? 503 : err instanceof TypeError ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

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
