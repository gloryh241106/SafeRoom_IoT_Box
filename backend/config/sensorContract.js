/**
 * Canonical backend interpretation of sensor values received from the ESP32.
 *
 * MQ-2 values are direct 12-bit ESP32 ADC indices. They are deliberately not
 * labelled as PPM because the project does not perform gas-specific calibration.
 * Keeping these constants in one module prevents validation, defaults, mocks,
 * and user-facing responses from drifting to different units or ranges.
 */
const MQ2_ADC_MIN = 0;
const MQ2_ADC_MAX = 4095;
const MQ2_UNIT = 'adc_index';
const DEFAULT_GAS_ALERT_THRESHOLD = 600;
// The engine triggers on `raw > threshold`; reserving 4095 as a possible
// breaching sample prevents operators from configuring an unreachable alarm.
const MAX_GAS_ALERT_THRESHOLD = MQ2_ADC_MAX - 1;

module.exports = {
  DEFAULT_GAS_ALERT_THRESHOLD,
  MAX_GAS_ALERT_THRESHOLD,
  MQ2_ADC_MAX,
  MQ2_ADC_MIN,
  MQ2_UNIT
};
