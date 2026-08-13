#pragma once

#include <Arduino.h>
#include <Adafruit_SSD1306.h>

class OledDisplay {
public:
    OledDisplay();
    bool begin(uint8_t sdaPin, uint8_t sclPin, uint8_t address);
    void showStatus(const char* title, const String& line1 = "", const String& line2 = "");
    void showGasWarning(int gasValue, int threshold);

private:
    Adafruit_SSD1306 _display;
    bool _ready = false;
};
