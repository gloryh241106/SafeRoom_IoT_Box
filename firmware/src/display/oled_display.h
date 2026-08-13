#ifndef __OLED_DISPLAY_H__
#define __OLED_DISPLAY_H__

#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_SSD1306.h>

// Display states driven by the main loop.
enum class DisplayMode {
    BOOT,
    CONNECTING,
    AP_MODE,
    CONNECTED,
    WARNING
};

// Snapshot of current sensor/actuator state shared with the display. The
// WARNING screen reads gasPpm; the remaining fields mirror the telemetry
// payload so the loop can pass one struct through the whole pipeline.
struct SensorSnapshot {
    float temperature = 0.0f;
    float humidity = 0.0f;
    float gasPpm = 0.0f;
    uint32_t gasAdcMillivolts = 0;
    bool gasReady = false;
    bool motionDetected = false;
    bool fanOn = false;
    bool buzzerActive = false;
    bool alertLedActive = false;
};

/*
 * SSD1306 OLED (I2C, SDA 21 / SCL 22).
 *
 * Sole mission: render a brief provisioning/status header (BOOT, CONNECTING,
 * AP_MODE, CONNECTED) and the MQ2 gas WARNING screen when gas > 600 PPM.
 * No sensor pages are rendered.
 */
class OledDisplay {
public:
    void begin(uint8_t sdaPin, uint8_t sclPin);

    void setMode(DisplayMode mode);
    void setWarningActive(bool active);
    void setTextInfo(const String& line1, const String& line2);
    void setSensorSnapshot(const SensorSnapshot& snapshot);

    void update(); // call from loop(); re-renders on mode change

private:
    void render();

    Adafruit_SSD1306 _display;
    DisplayMode _mode = DisplayMode::BOOT;
    bool _warningActive = false;
    SensorSnapshot _snapshot;
    String _line1;
    String _line2;
    DisplayMode _renderedMode = static_cast<DisplayMode>(-1);
    bool _dirty = true;
};

#endif // __OLED_DISPLAY_H__
