#pragma once

#include <Arduino.h>

// Hardware GPIO mapping; update this section when wiring changes.
constexpr uint8_t PIN_DHT22 = 4;
constexpr uint8_t PIN_PIR = 13;
constexpr uint8_t PIN_MQ2 = 34;
constexpr uint8_t PIN_FAN_RELAY = 16;
constexpr uint8_t PIN_ALERT_LED = 18;
constexpr uint8_t PIN_BUZZER = 19;
constexpr uint8_t PIN_OLED_SDA = 21;
constexpr uint8_t PIN_OLED_SCL = 22;

// Module polarity and hardware address settings.
constexpr bool FAN_RELAY_ACTIVE_LOW = true;
// The buzzer module is low-trigger (SIG LOW = ON) and is powered at 3.3 V, so
// the GPIO's 3.3 V HIGH is a true OFF level (verified on hardware). Driven
// directly: SIG -> GPIO 19, VCC -> 3.3 V, GND -> GND.
constexpr bool BUZZER_ACTIVE_LOW = true;
constexpr uint8_t OLED_ADDRESS = 0x3C;

// Captive portal used when the saved WiFi network is unavailable.
constexpr char WIFI_AP_NAME[] = "Safebox-AP";
constexpr char WIFI_AP_PASSWORD[] = "12345678";
constexpr uint8_t WIFI_CONNECT_TIMEOUT_SECONDS = 5;

// Non-blocking task intervals in milliseconds.
constexpr uint32_t SENSOR_TELEMETRY_INTERVAL_MS = 2000;
constexpr uint32_t MQTT_RECONNECT_INTERVAL_MS = 3000;
constexpr uint32_t NTP_STATUS_LOG_INTERVAL_MS = 5000;
constexpr uint32_t NTP_MIN_VALID_UNIX_TIME = 1609459200;  // 2021-01-01 UTC
constexpr uint32_t GAS_SAMPLE_INTERVAL_MS = 50;
// A cold MQ2 heater outputs a near-max ADC value for tens of seconds, so
// alarm decisions are suppressed (and readings marked invalid) until 30 s.
constexpr uint32_t GAS_STARTUP_STABILIZE_MS = 30000;
constexpr uint32_t EDGE_ALERT_RETRY_MS = 3000;

// Raw 12-bit MQ2 project thresholds; these values are not PPM.
// The backend rewrites GAS_ALARM_THRESHOLD_RAW (and keeps GAS_CLEAR_THRESHOLD_RAW
// 100 counts below it) from the Settings "BACKEND MQ-2 Raw ADC Max" field when
// thresholds are saved. The defaults below are the initial value; a firmware
// rebuild + reflash is required for a changed threshold to take effect.
constexpr uint16_t GAS_ALARM_THRESHOLD_RAW = 1200;
constexpr uint16_t GAS_CLEAR_THRESHOLD_RAW = 1100;
constexpr uint8_t GAS_CONFIRM_SAMPLES = 3;
// While the alarm is active, this many consecutive samples below the alarm
// threshold (100 x 50 ms = 5 s) also clear it. A clean-air baseline that
// oscillates inside the 500-600 band can therefore never latch the buzzer on.
constexpr uint8_t GAS_AUTO_CLEAR_SAMPLES = 100;

// PubSubClient and TLS limits.
constexpr uint16_t MQTT_BUFFER_SIZE = 1024;
constexpr uint16_t MQTT_KEEPALIVE_SECONDS = 15;
constexpr uint16_t MQTT_SOCKET_TIMEOUT_SECONDS = 2;

#ifndef SAFEBOX_DEBUG
#define SAFEBOX_DEBUG 1
#endif

// Set SAFEBOX_DEBUG to 0 to remove Serial debug output.
#if SAFEBOX_DEBUG
#define SAFEBOX_LOG_LN(message) Serial.println(message)
#define SAFEBOX_LOGF(...) Serial.printf(__VA_ARGS__)
#else
#define SAFEBOX_LOG_LN(message)
#define SAFEBOX_LOGF(...)
#endif
