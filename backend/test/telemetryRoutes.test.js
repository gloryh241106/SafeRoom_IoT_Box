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

test('sub-samples with maxPoints using last-of-bucket representatives', async () => {
  const originalAggregate = SensorReading.aggregate;
  const captured = {};
  const representatives = [
    { timestamp: new Date('2026-08-06T00:00:04.000Z'), metrics: { temperature: 27 } },
    { timestamp: new Date('2026-08-06T00:00:06.000Z'), metrics: { temperature: 28 } }
  ];

  SensorReading.aggregate = (pipeline) => {
    captured.pipeline = pipeline;
    return {
      then(resolve, reject) {
        return Promise.resolve([...representatives]).then(resolve, reject);
      }
    };
  };

  try {
    const query = new URLSearchParams({
      deviceId: 'safebox-01',
      from: '2026-08-06T00:00:00.000Z',
      to: '2026-08-06T00:10:00.000Z',
      maxPoints: '1000'
    });
    const response = await fetch(`${baseUrl}/api/v1/telemetry/historical?${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.subSampled, true);
    assert.deepEqual(
      body.data.map((reading) => reading.timestamp),
      ['2026-08-06T00:00:04.000Z', '2026-08-06T00:00:06.000Z']
    );

    const matchStage = captured.pipeline[0];
    assert.deepEqual(matchStage.$match.deviceId, 'safebox-01');
    assert.equal(matchStage.$match.timestamp.$gte.toISOString(), '2026-08-06T00:00:00.000Z');
    assert.equal(matchStage.$match.timestamp.$lte.toISOString(), '2026-08-06T00:10:00.000Z');
    assert.deepEqual(captured.pipeline[1], { $sort: { timestamp: 1 } });

    // 10-minute window / 1000 points -> 600 ms buckets, last sample per bucket.
    const groupStage = captured.pipeline[2].$group;
    assert.deepEqual(groupStage.rep, { $last: '$$ROOT' });
    const bucketMs = 600;
    assert.deepEqual(groupStage._id, {
      $subtract: [
        { $toLong: '$timestamp' },
        { $mod: [{ $toLong: '$timestamp' }, bucketMs] }
      ]
    });

    assert.deepEqual(captured.pipeline[3], { $replaceRoot: { newRoot: '$rep' } });
    assert.deepEqual(captured.pipeline[4], { $sort: { timestamp: 1 } });
  } finally {
    SensorReading.aggregate = originalAggregate;
  }
});

test('sub-sampling keeps the sensor projection and chronological output', async () => {
  const originalAggregate = SensorReading.aggregate;
  const captured = {};
  const readings = [{ timestamp: new Date('2026-08-06T00:00:06.000Z'), metrics: { temperature: 28 } }];

  SensorReading.aggregate = (pipeline) => {
    captured.pipeline = pipeline;
    return {
      then(resolve, reject) {
        return Promise.resolve([...readings]).then(resolve, reject);
      }
    };
  };

  try {
    const query = new URLSearchParams({
      sensor: 'temperature',
      from: '2026-08-06T00:00:00.000Z',
      to: '2026-08-06T00:10:00.000Z',
      maxPoints: '10'
    });
    const response = await fetch(`${baseUrl}/api/v1/telemetry/historical?${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 200);

    const projectStage = captured.pipeline[captured.pipeline.length - 1];
    assert.deepEqual(projectStage, {
      $project: { timestamp: 1, deviceId: 1, 'metrics.temperature': 1 }
    });
  } finally {
    SensorReading.aggregate = originalAggregate;
  }
});

test('rejects invalid maxPoints and accepts the raised limit cap', async () => {
  const originalFind = SensorReading.find;
  const originalAggregate = SensorReading.aggregate;
  SensorReading.find = () => ({
    sort() { return this; },
    limit() { return this; },
    select() { return this; },
    then(resolve, reject) {
      return Promise.resolve([]).then(resolve, reject);
    }
  });
  SensorReading.aggregate = () => ({
    then(resolve, reject) {
      return Promise.resolve([]).then(resolve, reject);
    }
  });

  try {
    for (const bad of ['0', '-1', '1001', 'abc', '1.5']) {
      const query = new URLSearchParams({
        from: '2026-08-06T00:00:00.000Z',
        to: '2026-08-06T00:10:00.000Z',
        maxPoints: bad
      });
      const response = await fetch(`${baseUrl}/api/v1/telemetry/historical?${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json();
      assert.equal(response.status, 400);
      assert.match(body.error, /maxPoints must be an integer between 1 and 1000/);
    }

    const missingWindow = await fetch(`${baseUrl}/api/v1/telemetry/historical?maxPoints=1000`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(missingWindow.status, 400);
    assert.match((await missingWindow.json()).error, /maxPoints requires both from and to/);

    const fullRes = await fetch(`${baseUrl}/api/v1/telemetry/historical?limit=3600`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(fullRes.status, 200);
    assert.equal((await fullRes.json()).subSampled, false);
  } finally {
    SensorReading.find = originalFind;
    SensorReading.aggregate = originalAggregate;
  }
});
