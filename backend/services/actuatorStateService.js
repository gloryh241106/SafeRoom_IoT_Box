const DEFAULT_ACTUATOR_STATES = Object.freeze({
  fanOn: false,
  buzzerActive: false,
  alertLedActive: false
});

const ACTUATOR_STATE_FIELDS = Object.freeze({
  fan: 'fanOn',
  buzzer: 'buzzerActive',
  alertLed: 'alertLedActive'
});

let currentActuatorStates = { ...DEFAULT_ACTUATOR_STATES };

function getCurrentActuatorStates() {
  return { ...currentActuatorStates };
}

function updateActuatorState(actuator, state) {
  const stateField = ACTUATOR_STATE_FIELDS[actuator];
  if (!stateField) throw new TypeError(`Unsupported actuator '${actuator}'`);

  currentActuatorStates = {
    ...currentActuatorStates,
    [stateField]: Boolean(state)
  };
  return getCurrentActuatorStates();
}

// Device telemetry is authoritative and replaces the optimistic requested state.
function synchronizeActuatorStates(actuatorStates) {
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
  ACTUATOR_STATE_FIELDS,
  DEFAULT_ACTUATOR_STATES,
  getCurrentActuatorStates,
  resetActuatorStatesForTests,
  synchronizeActuatorStates,
  updateActuatorState
};
