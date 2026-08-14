/** Verifies bounded Time-Series queries and chronological API output. */
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.MOCK_HARDWARE = 'true';
process.env.JWT_SECRET = 'telemetry-route-test-secret';

const { SensorReading } = require('../models/Schemas');
const { app } = require('../server');

let server;
let baseUrl;
let token;

test.before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = jwt.sign(
    { id: 'telemetry-test-user', username: 'telemetry-test' },
    process.env.JWT_SECRET
  );
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('returns the newest limited readings in chronological order', async () => {
  const originalFind = SensorReading.find;
  const captured = {};
  const newestFirst = [
    { timestamp: new Date('2026-08-06T00:00:06.000Z'), metrics: { temperature: 28 } },
    { timestamp: new Date('2026-08-06T00:00:04.000Z'), metrics: { temperature: 27 } }
  ];

  SensorReading.find = (query) => {
    captured.query = query;
    return {
      sort(value) {
        captured.sort = value;
        return this;
      },
      limit(value) {
        captured.limit = value;
        return this;
      },
      select(value) {
        captured.select = value;
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve([...newestFirst]).then(resolve, reject);
      }
    };
  };

  try {
    const query = new URLSearchParams({
      deviceId: 'safebox-01',
      from: '2026-08-06T00:00:00.000Z',
      to: '2026-08-06T00:01:00.000Z',
      sensor: 'temperature',
      limit: '2'
    });
    const response = await fetch(`${baseUrl}/api/v1/telemetry/historical?${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(captured.sort, { timestamp: -1 });
    assert.equal(captured.limit, 2);
    assert.deepEqual(captured.select, {
      timestamp: 1,
      deviceId: 1,
      'metrics.temperature': 1
    });
    assert.equal(captured.query.deviceId, 'safebox-01');
    assert.equal(captured.query.timestamp.$gte.toISOString(), '2026-08-06T00:00:00.000Z');
    assert.equal(captured.query.timestamp.$lte.toISOString(), '2026-08-06T00:01:00.000Z');
    assert.deepEqual(
      body.data.map((reading) => reading.timestamp),
      ['2026-08-06T00:00:04.000Z', '2026-08-06T00:00:06.000Z']
    );
  } finally {
    SensorReading.find = originalFind;
  }
});

test('accepts both gasRaw and legacy gasLevel historical selectors', async () => {
  const originalFind = SensorReading.find;
  const selectedFields = [];

  SensorReading.find = () => ({
    sort() { return this; },
    limit() { return this; },
    select(value) {
      selectedFields.push(value);
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve([]).then(resolve, reject);
    }
  });

  try {
    for (const sensor of ['gasRaw', 'gasLevel']) {
      const query = new URLSearchParams({ sensor });
      const response = await fetch(`${baseUrl}/api/v1/telemetry/historical?${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(response.status, 200);
    }

    assert.deepEqual(selectedFields, [
      { timestamp: 1, deviceId: 1, 'metrics.gasRaw': 1 },
      { timestamp: 1, deviceId: 1, 'metrics.gasLevel': 1 }
    ]);
  } finally {
    SensorReading.find = originalFind;
  }
});
