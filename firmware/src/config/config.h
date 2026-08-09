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
// OLED Display
// =========================
#define OLED_I2C_ADDR    0x3C
