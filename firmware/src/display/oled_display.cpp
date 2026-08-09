#include "oled_display.h"
#include "../config/config.h"

void OledDisplay::begin(uint8_t sdaPin, uint8_t sclPin) {
    Wire.begin(sdaPin, sclPin);
    if (!_display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
        return; // OLED absent/address mismatch; device keeps running headless
    }
    _display.clearDisplay();
    _display.setTextColor(SSD1306_WHITE);
    _display.setTextSize(1);
    _display.setCursor(0, 0);
    _display.print("SafeRoom IoT Box");
    _display.display();
}

void OledDisplay::setMode(DisplayMode mode) {
    _mode = mode;
}

void OledDisplay::setTextInfo(const String& line1, const String& line2) {
    _line1 = line1;
    _line2 = line2;
}

void OledDisplay::setSensorSnapshot(const SensorSnapshot& snapshot) {
    _snapshot = snapshot;
}

void OledDisplay::update() {
    if (_mode != _renderedMode) render();
}

void OledDisplay::render() {
    _renderedMode = _mode;
    _display.clearDisplay();
    _display.setCursor(0, 0);
    _display.setTextSize(1);

    switch (_mode) {
        case DisplayMode::BOOT:
            _display.println("SafeRoom IoT Box");
            _display.println("Booting...");
            break;

        case DisplayMode::CONNECTING:
            _display.println("Connecting...");
            _display.println(_line1);
            break;

        case DisplayMode::AP_MODE:
            _display.println("AP Mode:");
            _display.println(" Safebox-AP");
            _display.println("WiFi to configure");
            _display.println("http://192.168.4.1");
            break;

        case DisplayMode::CONNECTED:
            _display.println("Connected");
            _display.println("IP: " + _line1);
            _display.println("Device: " + _line2);
            break;

        case DisplayMode::WARNING:
            _display.setTextSize(2);
            _display.println("WARNING");
            _display.println("GAS!");
            _display.setTextSize(1);
            _display.print("Gas: ");
            _display.print(static_cast<int>(_snapshot.gasPpm));
            _display.println(" PPM");
            _display.print("Limit: ");
            _display.print(static_cast<int>(GAS_ALERT_THRESHOLD_PPM));
            _display.println(" PPM");
            break;
    }

    _display.display();
}
