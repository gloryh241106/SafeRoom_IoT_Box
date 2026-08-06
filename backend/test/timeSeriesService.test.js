const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EXPIRE_AFTER_SECONDS,
  TIME_SERIES_OPTIONS,
  ensureSensorReadingsTimeSeries,
  validateCollectionOptions
} = require('../services/timeSeriesService');

function validCollectionInfo() {
  return {
    name: 'sensor_readings',
    options: {
      timeseries: { ...TIME_SERIES_OPTIONS },
      expireAfterSeconds: EXPIRE_AFTER_SECONDS
    }
  };
}

test('creates the sensor collection with Time Series and 30-day retention options', async () => {
  let collectionInfo = null;
  let createOptions = null;
  const db = {
    listCollections() {
      return { async next() { return collectionInfo; } };
    },
    async createCollection(name, options) {
      assert.equal(name, 'sensor_readings');
      createOptions = options;
      collectionInfo = validCollectionInfo();
    }
  };

  const result = await ensureSensorReadingsTimeSeries(db);
  assert.deepEqual(createOptions.timeseries, TIME_SERIES_OPTIONS);
  assert.equal(createOptions.expireAfterSeconds, EXPIRE_AFTER_SECONDS);
  assert.equal(result.collection, 'sensor_readings');
});

test('fails fast when an existing collection is not a Time Series collection', () => {
  assert.throws(
    () => validateCollectionOptions({ name: 'sensor_readings', options: {} }),
    /is not configured as required/
  );
});
