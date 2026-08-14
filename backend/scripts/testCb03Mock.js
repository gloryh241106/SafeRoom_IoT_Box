/**
 * Standalone CB-03 smoke test. It opens only an ephemeral local HTTP port and
 * forces mock hardware, proving JWT protection and the fan command contract
 * without MongoDB, EMQX, SMTP, or an ESP32.
 */
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.MOCK_HARDWARE = 'true';
process.env.DEVICE_ID = process.env.DEVICE_ID || 'safebox-01';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'cb03-test-secret';

const { app } = require('../server');
const { initializeMqttService, stopMqttService } = require('../services/mqttService');

const quietLogger = {
  log() {},
  warn() {},
  error() {}
};
const authToken = jwt.sign({ id: 'cb03-test-user', username: 'cb03-test' }, process.env.JWT_SECRET);
const authHeaders = {
  Authorization: `Bearer ${authToken}`,
  'Content-Type': 'application/json'
};

async function sendFanCommand(baseUrl, state) {
  const response = await fetch(`${baseUrl}/api/v1/control/actuator`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      deviceId: process.env.DEVICE_ID,
      actuator: 'fan',
      state
    })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.delivery, 'mocked');
  assert.equal(body.currentActuatorStates.fanOn, state);
}

async function run() {
  initializeMqttService({ logger: quietLogger });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const unauthorizedResponse = await fetch(`${baseUrl}/api/v1/control/status`);
    assert.equal(unauthorizedResponse.status, 401);

    await sendFanCommand(baseUrl, true);

    const statusResponse = await fetch(
      `${baseUrl}/api/v1/control/status?deviceId=${encodeURIComponent(process.env.DEVICE_ID)}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    const status = await statusResponse.json();
    assert.equal(statusResponse.status, 200);
    assert.equal(status.success, true);
    assert.equal(status.mqtt.mode, 'mock');
    assert.equal(status.actuators.fanOn, true);

    await sendFanCommand(baseUrl, false);
    console.log('CB-03 PASS: unauthorized access blocked; authenticated fan ON, status, and fan OFF succeeded.');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await stopMqttService();
  }
}

run().catch((error) => {
  console.error(`CB-03 FAIL: ${error.message}`);
  process.exitCode = 1;
});
