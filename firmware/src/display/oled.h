#pragma once

#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

/** Displays network status and gas warnings on a 128x64 SSD1306 OLED. */
class OledDisplay {
public:
    /** Creates the OLED driver on the shared I2C bus. */
    OledDisplay();

    /** Starts I2C, creates the mutex, and initializes the display. */
    bool begin(uint8_t sdaPin, uint8_t sclPin, uint8_t address);

    /** Shows three status lines unless a gas warning has priority. */
    void showStatus(const String& line1, const String& line2 = "",
                    const String& line3 = "");

    /** Shows a gas warning and blocks normal status screens. */
    void showGasWarning(uint16_t gasRaw, uint16_t threshold);

    /** Releases gas-warning priority after the reading becomes safe. */
    void clearGasWarning();

private:
    /** Acquires OLED access for up to 50 ms. */
    bool lock();

    /** Releases the OLED mutex after drawing. */
    void unlock();

    /** Clears the display and draws three text lines. */
    void drawLines(const String& line1, const String& line2, const String& line3);

    Adafruit_SSD1306 _display;
    SemaphoreHandle_t _mutex = nullptr;
    bool _ready = false;
    bool _gasWarning = false;
};
