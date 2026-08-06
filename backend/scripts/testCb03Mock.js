const assert = require('node:assert/strict');

process.env.MOCK_HARDWARE = 'true';
process.env.DEVICE_ID = process.env.DEVICE_ID || 'safebox-01';

const { app } = require('../server');
const { initializeMqttService, stopMqttService } = require('../services/mqttService');

const quietLogger = {
  log() {},
  warn() {},
  error() {}
};

async function sendFanCommand(baseUrl, state) {
  const response = await fetch(`${baseUrl}/api/v1/control/actuator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    await sendFanCommand(baseUrl, true);

    const statusResponse = await fetch(
      `${baseUrl}/api/v1/control/status?deviceId=${encodeURIComponent(process.env.DEVICE_ID)}`
    );
    const status = await statusResponse.json();
    assert.equal(statusResponse.status, 200);
    assert.equal(status.success, true);
    assert.equal(status.mqtt.mode, 'mock');
    assert.equal(status.actuators.fanOn, true);

    await sendFanCommand(baseUrl, false);
    console.log('CB-03 PASS: REST fan ON, status confirmation, and fan OFF all succeeded in simulation mode.');
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
