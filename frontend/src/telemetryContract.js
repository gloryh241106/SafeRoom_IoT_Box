/**
 * Shared frontend interpretation of the backend telemetry document.
 *
 * The MQ-2 value is deliberately presented as an uncalibrated ESP32 ADC count.
 * Converting that count to PPM would require a gas-specific calibration curve,
 * so UI code must never relabel or rescale it as a physical concentration.
 */

export const MQ2_ADC_MIN = 0;
export const MQ2_ADC_MAX = 4095;
export const MQ2_UNIT = 'adc_index';

// Runtime alarms use `raw > threshold`, so 4094 is the highest threshold that
// still permits the 12-bit maximum (4095) to produce an anomaly.
export const MAX_GAS_ALERT_THRESHOLD = MQ2_ADC_MAX - 1;

// Used only when the backend threshold endpoint cannot be reached.
export const DEFAULT_GAS_ALERT_THRESHOLD = 600;

// Edge safety is compiled into the ESP32 and is not changed by the web form.
export const FIRMWARE_EDGE_GAS_THRESHOLD = 600;

/**
 * Read the canonical raw MQ-2 sample while accepting older telemetry records.
 * New payloads expose `gasRaw`; `gasLevel` remains a compatibility alias in the
 * current backend schema and in readings stored before the raw field existed.
 */
export function getRawGasValue(metrics) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;

  // Explicit false means the producer did not declare this sample usable; it is
  // not an electrical-fault diagnosis. Missing validity/unit support old records.
  if (metrics.gasValid !== undefined && metrics.gasValid !== true) return null;
  if (metrics.gasUnit !== undefined && metrics.gasUnit !== MQ2_UNIT) return null;

  const hasRaw = metrics.gasRaw !== undefined && metrics.gasRaw !== null;
  const hasAlias = metrics.gasLevel !== undefined && metrics.gasLevel !== null;
  const rawValue = hasRaw ? metrics.gasRaw : metrics.gasLevel;
  if (!Number.isInteger(rawValue) || rawValue < MQ2_ADC_MIN || rawValue > MQ2_ADC_MAX) return null;

  // The backend publishes both names during migration; disagreement is a
  // malformed snapshot and must not be rendered as a trustworthy reading.
  if (hasRaw && hasAlias && metrics.gasRaw !== metrics.gasLevel) return null;
  return rawValue;
}

/**
 * An in-range integer can still be producer-declared unusable, so both the raw
 * contract and the validity flag must be checked before rendering it.
 */
export function hasValidRawGasValue(metrics) {
  return getRawGasValue(metrics) !== null;
}

/**
 * Convert a raw count to presentation width only. The raw value itself is
 * preserved for labels, CSV export, storage, and threshold comparisons.
 */
export function rawGasProgressPercent(rawValue) {
  if (!Number.isInteger(rawValue) || rawValue < MQ2_ADC_MIN || rawValue > MQ2_ADC_MAX) return 0;
  return ((rawValue - MQ2_ADC_MIN) / (MQ2_ADC_MAX - MQ2_ADC_MIN)) * 100;
}

/** Format an engineering-unit reading without modifying its source value. */
export function formatMetric(value, fractionDigits = 1) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : 'n/a';
}
