#pragma once

#ifndef SAFEBOX_DEBUG
#define SAFEBOX_DEBUG 1
#endif

#if SAFEBOX_DEBUG
#define DBG(...) Serial.printf(__VA_ARGS__)
#define DBGLN(message) Serial.println(message)
#else
#define DBG(...)
#define DBGLN(message)
#endif

constexpr uint32_t TELEMETRY_INTERVAL_MS = 2000;
constexpr uint32_t GAS_INTERVAL_MS = 100;
constexpr uint32_t MOTION_LATCH_MS = 10000;
constexpr uint32_t BEEP_INTERVAL_MS = 500;
constexpr uint32_t ALERT_REPEAT_MS = 30000;
constexpr uint32_t MQTT_RECONNECT_MS = 3000;
constexpr uint32_t WIFI_RECONNECT_MS = 5000;

constexpr uint16_t WIFI_CONNECT_TIMEOUT_S = 30;
constexpr uint16_t WIFI_PORTAL_TIMEOUT_S = 180;
constexpr char WIFI_AP_NAME[] = "Safebox-AP";

constexpr uint16_t MQTT_BUFFER_SIZE = 1024;
constexpr uint16_t MQTT_KEEPALIVE_S = 15;

constexpr int GAS_ALERT_THRESHOLD = 600;
constexpr int GAS_CLEAR_THRESHOLD = 550;

constexpr bool RELAY_ACTIVE_LOW = true;
constexpr bool BUZZER_ACTIVE_LOW = false;
constexpr uint8_t OLED_I2C_ADDRESS = 0x3C;
