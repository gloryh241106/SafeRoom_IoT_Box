/** Regression tests for the pure MQ-2 frontend boundary helpers. */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_GAS_ALERT_THRESHOLD,
  MQ2_ADC_MAX,
  MQ2_UNIT,
  getRawGasValue,
  hasValidRawGasValue,
  rawGasProgressPercent
} from '../src/telemetryContract.js';

test('accepts new and legacy integer ADC telemetry without recalibration', () => {
  const current = {
    gasLevel: 611,
    gasRaw: 611,
    gasValid: true,
    gasUnit: MQ2_UNIT
  };
  assert.equal(getRawGasValue(current), 611);
  assert.equal(hasValidRawGasValue(current), true);

  // Older stored readings did not contain gasRaw, gasValid, or gasUnit.
  assert.equal(getRawGasValue({ gasLevel: 420 }), 420);
  assert.equal(rawGasProgressPercent(MQ2_ADC_MAX), 100);
  assert.equal(MAX_GAS_ALERT_THRESHOLD, 4094);
});

test('rejects malformed, invalid, or contradictory MQ2 telemetry', () => {
  const rejectedMetrics = [
    { gasRaw: 600.5, gasValid: true, gasUnit: MQ2_UNIT },
    { gasRaw: MQ2_ADC_MAX + 1, gasValid: true, gasUnit: MQ2_UNIT },
    { gasRaw: 600, gasValid: false, gasUnit: MQ2_UNIT },
    { gasRaw: 600, gasValid: 'true', gasUnit: MQ2_UNIT },
    { gasRaw: 600, gasValid: true, gasUnit: 'ppm' },
    { gasRaw: 600, gasLevel: 601, gasValid: true, gasUnit: MQ2_UNIT }
  ];

  for (const metrics of rejectedMetrics) {
    assert.equal(getRawGasValue(metrics), null);
    assert.equal(hasValidRawGasValue(metrics), false);
  }
  assert.equal(rawGasProgressPercent(600.5), 0);
  assert.equal(rawGasProgressPercent(MQ2_ADC_MAX + 1), 0);
});
