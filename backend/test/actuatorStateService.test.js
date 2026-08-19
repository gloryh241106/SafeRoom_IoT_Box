/** Verifies optimistic actuator state and authoritative telemetry reconciliation. */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCurrentActuatorStates,
  resetActuatorStatesForTests,
  synchronizeActuatorStates,
  updateActuatorState
} = require('../services/actuatorStateService');

test.beforeEach(() => resetActuatorStatesForTests());

test('updates the directly supported fan state', () => {
  updateActuatorState('fan', true);

  assert.deepEqual(getCurrentActuatorStates(), {
    fanOn: true,
    buzzerActive: false,
    alertLedActive: false
  });
});

test('rejects actuators that are not remotely controllable', () => {
  assert.throws(() => updateActuatorState('buzzer', true), TypeError);
  assert.throws(() => updateActuatorState('alertLed', true), TypeError);
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
