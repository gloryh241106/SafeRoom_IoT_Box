#include "oled_display.h"
#include <Wire.h>

OledDisplay::OledDisplay() : _display(128, 64, &Wire, -1) {}

bool OledDisplay::begin(uint8_t sdaPin, uint8_t sclPin, uint8_t address) {
    Wire.begin(sdaPin, sclPin);
    _ready = _display.begin(SSD1306_SWITCHCAPVCC, address);
    return _ready;
}

void OledDisplay::showStatus(const char* title, const String& line1, const String& line2) {
    if (!_ready) return;
    _display.clearDisplay();
    _display.setTextColor(SSD1306_WHITE);
    _display.setTextSize(1);
    _display.setCursor(0, 0);
    _display.println(title);
    if (line1.length()) _display.println(line1);
    if (line2.length()) _display.println(line2);
    _display.display();
}

void OledDisplay::showGasWarning(int gasValue, int threshold) {
    if (!_ready) return;
    _display.clearDisplay();
    _display.setTextColor(SSD1306_WHITE);
    _display.setCursor(0, 0);
    _display.setTextSize(2);
    _display.println("WARNING");
    _display.println("GAS!");
    _display.setTextSize(1);
    _display.printf("Gas: %d IDX\n", gasValue);
    _display.printf("Limit: %d IDX\n", threshold);
    _display.display();
}
