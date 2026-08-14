/** Exercises JWT protection at every non-public API prefix. */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.MOCK_HARDWARE = 'true';
process.env.JWT_SECRET = 'auth-middleware-test-secret';

const { app } = require('../server');

let server;
let baseUrl;

test.before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('protects every non-authenticated API prefix', async () => {
  const requests = [
    ['/api/v1/telemetry/latest'],
    ['/api/v1/control/status'],
    ['/api/v1/anomalies'],
    ['/api/v1/chatbot/query', { method: 'POST' }],
    ['/api/v1/users/profile']
  ];

  for (const [path, options] of requests) {
    const response = await fetch(`${baseUrl}${path}`, options);
    assert.equal(response.status, 401, `${path} should require a JWT`);
  }
});

test('allows an authenticated CB-03 command and rejects an invalid token', async () => {
  const invalidResponse = await fetch(`${baseUrl}/api/v1/control/status`, {
    headers: { Authorization: 'Bearer invalid-token' }
  });
  assert.equal(invalidResponse.status, 403);

  const token = jwt.sign(
    { id: 'auth-test-user', username: 'auth-test' },
    process.env.JWT_SECRET
  );
  const response = await fetch(`${baseUrl}/api/v1/control/actuator`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ deviceId: 'safebox-01', actuator: 'fan', state: true })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.delivery, 'mocked');
  assert.equal(body.currentActuatorStates.fanOn, true);
});
