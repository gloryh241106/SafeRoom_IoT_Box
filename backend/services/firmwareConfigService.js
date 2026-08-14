/**
 * Best-effort bridge between the runtime Settings form and the ESP32 firmware
 * compile-time configuration.
 *
 * The ESP32 edge gas alarm is compiled from firmware/src/config.h, so a web
 * threshold change cannot take effect on an already-flashed device without a
 * firmware rebuild. This service rewrites that source file so that the
 * "BACKEND MQ-2 Raw ADC Max" value configured in Settings becomes the firmware's
 * GAS_ALARM_THRESHOLD_RAW (edge) threshold, replacing the old fixed 600.
 *
 * All operations are best-effort: when the firmware source tree is absent (for
 * example on a backend-only deployment) they no-op and report null instead of
 * failing the threshold save.
 */
const fs = require('fs');
const path = require('path');

const CONFIG_H_PATH = path.resolve(__dirname, '../../firmware/src/config.h');

// Keep the clear threshold 100 counts below the alarm, preserving the original
// hysteresis so a clean-air baseline cannot latch the buzzer. Clamped to >= 0
// because the field is an unsigned uint16_t.
const CLEAR_HYSTERESIS = 100;

const ALARM_LINE_PATTERN = /(constexpr uint16_t GAS_ALARM_THRESHOLD_RAW\s*=\s*)(\d+)(;)/;
const CLEAR_LINE_PATTERN = /(constexpr uint16_t GAS_CLEAR_THRESHOLD_RAW\s*=\s*)(\d+)(;)/;

// Test-only override so unit tests never touch the real firmware source tree.
let configPathOverride = null;

function setFirmwareConfigPath(nextPath) {
  configPathOverride = nextPath || null;
}

function resolveConfigPath() {
  return configPathOverride || CONFIG_H_PATH;
}

function readConfigSource() {
  try {
    return fs.readFileSync(resolveConfigPath(), 'utf8');
  } catch (err) {
    // The firmware tree is optional in a backend-only deployment.
    return null;
  }
}

/**
 * Return the ESP32 edge gas alarm threshold currently declared in config.h,
 * or null when the file is unavailable/unreadable.
 */
function getFirmwareGasThresholds() {
  const source = readConfigSource();
  if (!source) return null;

  const alarmMatch = source.match(ALARM_LINE_PATTERN);
  const clearMatch = source.match(CLEAR_LINE_PATTERN);
  if (!alarmMatch) return null;

  return {
    alarm: Number.parseInt(alarmMatch[2], 10),
    clear: clearMatch ? Number.parseInt(clearMatch[2], 10) : null
  };
}

/**
 * Rewrite config.h with the supplied edge gas alarm threshold. Returns the
 * written alarm/clear pair, or null when the firmware file is unavailable.
 */
function setFirmwareGasThreshold(gasMax) {
  const source = readConfigSource();
  if (!source) return null;

  const alarm = Number(gasMax);
  const clear = Math.max(0, alarm - CLEAR_HYSTERESIS);
  let updated = source.replace(ALARM_LINE_PATTERN, `$1${alarm}$3`);
  if (updated !== source) {
    updated = updated.replace(CLEAR_LINE_PATTERN, `$1${clear}$3`);
  }

  try {
    fs.writeFileSync(resolveConfigPath(), updated, 'utf8');
  } catch (err) {
    return null;
  }

  return { alarm, clear };
}

module.exports = {
  CLEAR_HYSTERESIS,
  CONFIG_H_PATH,
  getFirmwareGasThresholds,
  setFirmwareConfigPath,
  setFirmwareGasThreshold
};