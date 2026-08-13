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
    if (_mode != mode) _dirty = true;
    _mode = mode;
}

void OledDisplay::setWarningActive(bool active) {
    if (_warningActive != active) _dirty = true;
    _warningActive = active;
}

void OledDisplay::setTextInfo(const String& line1, const String& line2) {
    if (_line1 == line1 && _line2 == line2) return;
    _line1 = line1;
    _line2 = line2;
    _dirty = true;
}

void OledDisplay::setSensorSnapshot(const SensorSnapshot& snapshot) {
    const bool warningChanged = _warningActive
        && (_snapshot.gasReady != snapshot.gasReady
            || _snapshot.gasAdcMillivolts != snapshot.gasAdcMillivolts
            || static_cast<int>(_snapshot.gasPpm) != static_cast<int>(snapshot.gasPpm));
    _snapshot = snapshot;
    if (warningChanged) _dirty = true;
}

void OledDisplay::update() {
    const DisplayMode desiredMode = _warningActive ? DisplayMode::WARNING : _mode;
    if (_dirty || desiredMode != _renderedMode) render();
}

void OledDisplay::render() {
    const DisplayMode renderMode = _warningActive ? DisplayMode::WARNING : _mode;
    _renderedMode = renderMode;
    _dirty = false;
    _display.clearDisplay();
    _display.setCursor(0, 0);
    _display.setTextSize(1);

    switch (renderMode) {
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
            if (_snapshot.gasReady) {
                _display.print("LPG est: ");
                _display.print(static_cast<int>(_snapshot.gasPpm));
                _display.println(" ppm");
                _display.print("Limit: ");
                _display.print(static_cast<int>(GAS_ALERT_THRESHOLD_PPM));
                _display.println(" ppm");
            } else {
                _display.print("Preparing MQ2");
                _display.println();
                _display.print("ADC: ");
                _display.print(_snapshot.gasAdcMillivolts);
                _display.println(" mV");
            }
            break;
    }

    _display.display();
}
