/** Covers the config.h read/write bridge used by the Settings threshold form. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CLEAR_HYSTERESIS,
  getFirmwareGasThresholds,
  setFirmwareConfigPath,
  setFirmwareGasThreshold
} = require('../services/firmwareConfigService');

const CONFIG_SAMPLE = `#pragma once

// Raw 12-bit MQ2 project thresholds; these values are not PPM.
constexpr uint16_t GAS_ALARM_THRESHOLD_RAW = 600;
constexpr uint16_t GAS_CLEAR_THRESHOLD_RAW = 500;
`;

let tempDir;

test.beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'firmware-config-'));
});

test.afterEach(() => {
  setFirmwareConfigPath(null);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('reads the alarm and clear thresholds currently declared in config.h', () => {
  const configPath = path.join(tempDir, 'config.h');
  fs.writeFileSync(configPath, CONFIG_SAMPLE, 'utf8');
  setFirmwareConfigPath(configPath);

  assert.deepEqual(getFirmwareGasThresholds(), { alarm: 600, clear: 500 });
});

test('rewrites both threshold lines and keeps clear 100 counts below the alarm', () => {
  const configPath = path.join(tempDir, 'config.h');
  fs.writeFileSync(configPath, CONFIG_SAMPLE, 'utf8');
  setFirmwareConfigPath(configPath);

  assert.deepEqual(setFirmwareGasThreshold(850), { alarm: 850, clear: 850 - CLEAR_HYSTERESIS });
  assert.deepEqual(getFirmwareGasThresholds(), { alarm: 850, clear: 750 });
  assert.match(fs.readFileSync(configPath, 'utf8'), /GAS_ALARM_THRESHOLD_RAW = 850;/);
  assert.match(fs.readFileSync(configPath, 'utf8'), /GAS_CLEAR_THRESHOLD_RAW = 750;/);
});

test('clamps the clear threshold at zero for very low alarm thresholds', () => {
  const configPath = path.join(tempDir, 'config.h');
  fs.writeFileSync(configPath, CONFIG_SAMPLE, 'utf8');
  setFirmwareConfigPath(configPath);

  assert.deepEqual(setFirmwareGasThreshold(30), { alarm: 30, clear: 0 });
  assert.deepEqual(getFirmwareGasThresholds(), { alarm: 30, clear: 0 });
});

test('returns null when the firmware source tree is unavailable', () => {
  setFirmwareConfigPath(path.join(tempDir, 'missing', 'config.h'));

  assert.equal(getFirmwareGasThresholds(), null);
  assert.equal(setFirmwareGasThreshold(600), null);
});