/**
 * Creates and verifies the MongoDB Time-Series collection before Mongoose writes
 * telemetry. Collection options cannot be retrofitted safely by a normal schema,
 * so incompatible deployments fail fast with a migration-oriented error.
 *
 * Study map (NC-03): this module owns collection semantics, while Schemas.js owns
 * document shape and telemetryService.js owns validation plus write ordering.
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

function findCollectionInfo(db) {
  return db.listCollections({ name: COLLECTION_NAME }, { nameOnly: false }).next();
}

function validateCollectionOptions(collectionInfo) {
  // listCollections() nests Time Series metadata under options.timeseries.
  const options = collectionInfo?.options || {};
  const timeSeries = options.timeseries || {};
  const mismatches = [];

  // Compare every required semantic option instead of checking only collection name.
  for (const [key, expected] of Object.entries(TIME_SERIES_OPTIONS)) {
    if (timeSeries[key] !== expected) {
      mismatches.push(`${key}=${JSON.stringify(timeSeries[key])} (expected ${JSON.stringify(expected)})`);
    }
  }

  // Drivers can expose this value as a BSON numeric wrapper, hence numericValue().
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
  // Read metadata first; writing through Mongoose before this check could create a normal collection.
  let collectionInfo = await findCollectionInfo(db);

  if (!collectionInfo) {
    try {
      // MongoDB needs collection-level options that cannot be added by document validation.
      await db.createCollection(COLLECTION_NAME, {
        timeseries: TIME_SERIES_OPTIONS,
        expireAfterSeconds: EXPIRE_AFTER_SECONDS
      });
    } catch (error) {
      // Another backend instance may win the create race during a simultaneous deployment.
      if (error.codeName !== 'NamespaceExists' && error.code !== 48) throw error;
    }

    // Re-read authoritative server metadata, including after a concurrent create race.
    collectionInfo = await findCollectionInfo(db);
  }

  if (!collectionInfo) {
    throw new Error(`MongoDB did not return metadata for '${COLLECTION_NAME}' after creation.`);
  }

  // Fail startup instead of silently ingesting into an incompatible collection.
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
