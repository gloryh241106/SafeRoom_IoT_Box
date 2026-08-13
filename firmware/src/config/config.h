#pragma once

/*
|--------------------------------------------------------------------------
| SafeRoom IoT Box
| Firmware Configuration & Application Constants
|--------------------------------------------------------------------------
*/

// Debug logging guard (compile-time). Build with -DSAFEBOX_DEBUG=0 to silence.
#ifndef SAFEBOX_DEBUG
#define SAFEBOX_DEBUG 1
#endif

#if SAFEBOX_DEBUG
#define DBG(...)  Serial.printf(__VA_ARGS__)
#define DBGLN(x)  Serial.println(x)
#else
#define DBG(...)
#define DBGLN(x)
#endif

// =========================
// Timing (milliseconds)
// =========================
#define SENSOR_INTERVAL_MS     2000UL  // full sensor read + telemetry publish
#define GAS_POLL_INTERVAL_MS   100UL   // fast gas poll for <200ms edge response
#define EDGE_BEEP_TOGGLE_MS    500UL   // buzzer beep cadence while gas breach
#define EDGE_RETRIGGER_ALERT_MS 30000UL // re-publish edge alert while breach persists

// =========================
// MQ2 Lifecycle & Circuit
// =========================
// A new/re-aged MQ2 must remain powered for 48 hours before clean-air Ro
// calibration. Progress is checkpointed in NVS and resumes after a reset.
#define MQ2_FIRST_BURN_IN_MS           (48UL * 60UL * 60UL * 1000UL)
#define MQ2_STARTUP_WARMUP_MS          (5UL * 60UL * 1000UL)
#define MQ2_BURN_IN_CHECKPOINT_MS      (10UL * 60UL * 1000UL)
#define MQ2_CALIBRATION_WINDOW_MS      (60UL * 1000UL)
#define MQ2_CALIBRATION_SAMPLE_MS      500UL
#define MQ2_CALIBRATION_MIN_SAMPLES    100U
#define MQ2_CALIBRATION_MAX_CV         0.05f

// MQ2 breakout sensing circuit: heater/Vc at 5 V, onboard RL commonly 1 kOhm.
// AO MUST pass through a 15 kOhm (AO->ADC) / 10 kOhm (ADC->GND) divider, so
// the ADC sees 40% of the module output (at most 2.0 V from a 5 V AO).
#define MQ2_CIRCUIT_VOLTAGE_MV         5000.0f
#define MQ2_MODULE_LOAD_RESISTANCE_OHM 1000.0f
#define MQ2_DIVIDER_TOP_OHM            15000.0f
#define MQ2_DIVIDER_BOTTOM_OHM         10000.0f
#define MQ2_ADC_DIVIDER_RATIO          (MQ2_DIVIDER_BOTTOM_OHM / (MQ2_DIVIDER_TOP_OHM + MQ2_DIVIDER_BOTTOM_OHM))
#define MQ2_EFFECTIVE_LOAD_OHM         (1.0f / ((1.0f / MQ2_MODULE_LOAD_RESISTANCE_OHM) + (1.0f / (MQ2_DIVIDER_TOP_OHM + MQ2_DIVIDER_BOTTOM_OHM))))
#define MQ2_ADC_VALID_MIN_MV           10U
#define MQ2_ADC_VALID_MAX_MV           2200U

// Before calibrated PPM is available, preserve local-only safety using a
// conservative ADC voltage threshold. Raw fallback alerts are never emailed.
#define MQ2_RAW_ALERT_ADC_MV           1900U
#define MQ2_RAW_CLEAR_ADC_MV           1800U

// =========================
// PIR Motion Latch
// =========================
#define MOTION_LATCH_MS        10000UL // keep motionDetected true this long after last trigger

// =========================
// WiFiManager Provisioning
// =========================
#define WIFI_CONNECT_TIMEOUT_S 30     // attempt saved NVS credentials
#define WIFI_PORTAL_TIMEOUT_S  180    // SoftAP captive portal window
#define WIFI_AP_NAME           "Safebox-AP"
#define WIFI_LOST_FALLBACK_MS  30000UL // WiFi loss before SoftAP fallback

// =========================
// MQTT
// =========================
#define MQTT_RECONNECT_MIN_MS  1000UL  // exponential backoff start
#define MQTT_RECONNECT_MAX_MS  60000UL // exponential backoff ceiling
#define MQTT_BUFFER_SIZE       1024
#define MQTT_KEEPALIVE_S       15

// =========================
// Safety Thresholds
// =========================
#define GAS_ALERT_THRESHOLD_PPM 600.0f // > 600 PPM -> local edge safety trigger
#define GAS_CLEAR_THRESHOLD_PPM 550.0f // hysteresis: clear below this PPM

// =========================
// Relay Module Logic Level
// =========================
// 1 = active-LOW module (e.g. HL-52S): IN LOW = relay ON, IN HIGH = OFF
// 0 = active-HIGH module:              IN HIGH = relay ON, IN LOW = OFF
#define RELAY_ACTIVE_LOW 1

// =========================
// Active Buzzer Module Logic Level
// =========================
// 0 = active-HIGH module (SIG HIGH = sound), the common 3-pin default
// 1 = active-LOW module  (SIG LOW = sound); change this if the module sounds
//     continuously at boot or reacts with reversed ON/OFF commands.
#define BUZZER_ACTIVE_LOW 0

// =========================
// OLED Display
// =========================
#define OLED_I2C_ADDR    0x3C
