/**
 * Creates and verifies the MongoDB Time-Series collection before Mongoose writes
 * telemetry. Collection options cannot be retrofitted safely by a normal schema,
 * so incompatible deployments fail fast with a migration-oriented error.
 */
const COLLECTION_NAME = 'sensor_readings';
const EXPIRE_AFTER_SECONDS = 30 * 24 * 60 * 60;
const TIME_SERIES_OPTIONS = {
  timeField: 'timestamp',
  metaField: 'deviceId',
  granularity: 'seconds'
};

function numericValue(value) {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}

function validateCollectionOptions(collectionInfo) {
  const options = collectionInfo?.options || {};
  const timeSeries = options.timeseries || {};
  const mismatches = [];

  for (const [key, expected] of Object.entries(TIME_SERIES_OPTIONS)) {
    if (timeSeries[key] !== expected) {
      mismatches.push(`${key}=${JSON.stringify(timeSeries[key])} (expected ${JSON.stringify(expected)})`);
    }
  }

  if (numericValue(options.expireAfterSeconds) !== EXPIRE_AFTER_SECONDS) {
    mismatches.push(
      `expireAfterSeconds=${JSON.stringify(options.expireAfterSeconds)} (expected ${EXPIRE_AFTER_SECONDS})`
    );
  }

  if (mismatches.length > 0) {
    throw new Error(
      `MongoDB collection '${COLLECTION_NAME}' is not configured as required: ${mismatches.join(', ')}. ` +
      'Rename or remove the existing collection, then restart the backend so it can be created correctly.'
    );
  }
}

/** Ensures collection creation/verification completes before telemetry producers start. */
async function ensureSensorReadingsTimeSeries(db) {
  let collectionInfo = await db.listCollections({ name: COLLECTION_NAME }, { nameOnly: false }).next();

  if (!collectionInfo) {
    try {
      await db.createCollection(COLLECTION_NAME, {
        timeseries: TIME_SERIES_OPTIONS,
        expireAfterSeconds: EXPIRE_AFTER_SECONDS
      });
    } catch (error) {
      // Another backend instance may win the create race during a simultaneous deployment.
      if (error.codeName !== 'NamespaceExists' && error.code !== 48) throw error;
    }

    collectionInfo = await db.listCollections({ name: COLLECTION_NAME }, { nameOnly: false }).next();
  }

  if (!collectionInfo) {
    throw new Error(`MongoDB did not return metadata for '${COLLECTION_NAME}' after creation.`);
  }

  validateCollectionOptions(collectionInfo);
  return {
    collection: COLLECTION_NAME,
    timeSeries: { ...TIME_SERIES_OPTIONS },
    expireAfterSeconds: EXPIRE_AFTER_SECONDS
  };
}

module.exports = {
  COLLECTION_NAME,
  EXPIRE_AFTER_SECONDS,
  TIME_SERIES_OPTIONS,
  ensureSensorReadingsTimeSeries,
  validateCollectionOptions
};
