#pragma once

/*
|--------------------------------------------------------------------------
| SafeRoom IoT Box
| Hardware Pin Mapping
|--------------------------------------------------------------------------
*/

// =========================
// Sensors
// =========================

constexpr uint8_t DHT22_PIN = 4;

constexpr uint8_t PIR_PIN = 13;

constexpr uint8_t MQ2_PIN = 34;


// =========================
// Actuators
// =========================

constexpr uint8_t FAN_RELAY_PIN = 16;

constexpr uint8_t STATUS_LED_PIN = 17;

constexpr uint8_t ALERT_LED_PIN = 18;

constexpr uint8_t BUZZER_PIN = 19;


// =========================
// OLED (I2C)
// =========================

constexpr uint8_t OLED_SDA_PIN = 21;

constexpr uint8_t OLED_SCL_PIN = 22;