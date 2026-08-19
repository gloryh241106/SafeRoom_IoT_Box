/**
 * Process-local actuator snapshot used by REST responses and mock hardware.
 * Command publication updates it optimistically; the next validated telemetry
 * snapshot replaces it with the device-confirmed state.
 *
 * Study map (CB-03): update = requested state; synchronize = reported state.
 * Neither value proves that the fan motor spins because there is no RPM sensor.
 */
const DEFAULT_ACTUATOR_STATES = Object.freeze({
  fanOn: false,
  buzzerActive: false,
  alertLedActive: false
});

let currentActuatorStates = { ...DEFAULT_ACTUATOR_STATES };

function getCurrentActuatorStates() {
  // Return a copy so callers cannot mutate process state without validation.
  return { ...currentActuatorStates };
}

function updateActuatorState(actuator, state) {
  // Only the fan crosses the remote-control boundary. Buzzer and LED are edge-only.
  if (actuator !== 'fan') throw new TypeError(`Unsupported actuator '${actuator}'`);

  // REST/MQTT call it "fan" while telemetry reports the boolean field "fanOn".
  currentActuatorStates = {
    ...currentActuatorStates,
    fanOn: Boolean(state)
  };
  return getCurrentActuatorStates();
}

// Never merge here: omitted fields must not leave stale optimistic state behind.
function synchronizeActuatorStates(actuatorStates) {
  // Device telemetry is authoritative, so replace all fields instead of merging.
  currentActuatorStates = {
    fanOn: Boolean(actuatorStates.fanOn),
    buzzerActive: Boolean(actuatorStates.buzzerActive),
    alertLedActive: Boolean(actuatorStates.alertLedActive)
  };
  return getCurrentActuatorStates();
}

function resetActuatorStatesForTests() {
  currentActuatorStates = { ...DEFAULT_ACTUATOR_STATES };
}

module.exports = {
  DEFAULT_ACTUATOR_STATES,
  getCurrentActuatorStates,
  resetActuatorStatesForTests,
  synchronizeActuatorStates,
  updateActuatorState
};
