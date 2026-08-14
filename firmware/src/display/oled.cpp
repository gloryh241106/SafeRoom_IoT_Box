#include "oled.h"

#include <Wire.h>

// Creates a 128x64 I2C display driver without a reset pin.
OledDisplay::OledDisplay() : _display(128, 64, &Wire, -1) {}

// Creates the mutex and initializes I2C and the OLED.
bool OledDisplay::begin(uint8_t sdaPin, uint8_t sclPin, uint8_t address) {
    _mutex = xSemaphoreCreateMutex();
    Wire.begin(sdaPin, sclPin);
    _ready = _mutex && _display.begin(SSD1306_SWITCHCAPVCC, address);
    if (_ready) showStatus("SafeRoom IoT Box", "Starting...");
    return _ready;
}

// Draws normal status only when no gas warning has priority.
void OledDisplay::showStatus(const String& line1, const String& line2,
                             const String& line3) {
    if (!lock()) return;
    if (!_gasWarning) drawLines(line1, line2, line3);
    unlock();
}

// Gives gas warning priority and displays its ADC value and limit.
void OledDisplay::showGasWarning(uint16_t gasRaw, uint16_t threshold) {
    if (!lock()) return;
    _gasWarning = true;
    drawLines("WARNING: GAS", "ADC: " + String(gasRaw),
              "Limit: " + String(threshold));
    unlock();
}

// Releases gas priority so main.cpp can restore network status.
void OledDisplay::clearGasWarning() {
    if (!lock()) return;
    _gasWarning = false;
    drawLines("Gas level normal", "Returning...", "");
    unlock();
}

// Waits up to 50 ms for safe OLED access.
bool OledDisplay::lock() {
    return _ready && _mutex && xSemaphoreTake(_mutex, pdMS_TO_TICKS(50)) == pdTRUE;
}

// Releases OLED access after drawing.
void OledDisplay::unlock() {
    xSemaphoreGive(_mutex);
}

// Clears and writes three text lines to the physical display.
void OledDisplay::drawLines(const String& line1, const String& line2,
                            const String& line3) {
    _display.clearDisplay();
    _display.setTextColor(SSD1306_WHITE);
    _display.setTextSize(1);
    _display.setCursor(0, 4);
    _display.println(line1);
    _display.setCursor(0, 24);
    _display.println(line2);
    _display.setCursor(0, 44);
    _display.println(line3);
    _display.display();
}
