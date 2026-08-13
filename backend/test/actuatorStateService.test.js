const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCurrentActuatorStates,
  resetActuatorStatesForTests,
  synchronizeActuatorStates,
  updateActuatorState
} = require('../services/actuatorStateService');

test.beforeEach(() => resetActuatorStatesForTests());

test('maps MQTT actuator names to telemetry state fields', () => {
  updateActuatorState('fan', true);
  updateActuatorState('buzzer', true);
  updateActuatorState('alertLed', true);

  assert.deepEqual(getCurrentActuatorStates(), {
    fanOn: true,
    buzzerActive: true,
    alertLedActive: true
  });
});

test('reconciles requested state with the next device telemetry snapshot', () => {
  updateActuatorState('fan', true);
  synchronizeActuatorStates({
    fanOn: false,
    buzzerActive: false,
    alertLedActive: true
  });

  assert.deepEqual(getCurrentActuatorStates(), {
    fanOn: false,
    buzzerActive: false,
    alertLedActive: true
  });
});
