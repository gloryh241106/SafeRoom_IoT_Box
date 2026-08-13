#include "safebox_app.h"
#include <Arduino.h>
#include <time.h>

#include "secrets.h"
#include "../config/pins.h"
#include "../config/settings.h"

SafeboxApp* SafeboxApp::_instance = nullptr;

SafeboxApp::SafeboxApp()
    : _dht22(DHT22_PIN),
      _mq2(MQ2_PIN),
      _pir(PIR_PIN, MOTION_LATCH_MS),
      _fanRelay(FAN_RELAY_PIN, RELAY_ACTIVE_LOW),
      _buzzer(BUZZER_PIN, BUZZER_ACTIVE_LOW),
      _statusLed(STATUS_LED_PIN),
      _alertLed(ALERT_LED_PIN),
      _remoteControl(_fanRelay, _buzzer, _alertLed, _state),
      _telemetry(_mqtt, _state, DEVICE_ID),
      _edgeSafety(_buzzer, _alertLed, _oled, _remoteControl, _telemetry, _state) {}

void SafeboxApp::begin() {
    _instance = this;
    Serial.begin(115200);

    _fanRelay.begin();
    _buzzer.begin();
    _statusLed.begin();
    _alertLed.begin();

    _dht22.begin();
    _pir.begin();
    _mq2.begin();

    _oled.begin(OLED_SDA_PIN, OLED_SCL_PIN, OLED_I2C_ADDRESS);
    _oled.showStatus("SafeRoom IoT Box", "Booting...");

    _wifi.begin(WIFI_AP_NAME, WIFI_CONNECT_TIMEOUT_S,
                WIFI_PORTAL_TIMEOUT_S, onApMode);
    _oled.showStatus("Connecting WiFi", WIFI_AP_NAME);
    if (!_wifi.connect()) ESP.restart();

    _statusLed.set(true);
    _oled.showStatus("Connected", _wifi.ipAddress(), DEVICE_ID);
    configTime(0, 0, "pool.ntp.org");

    _mqtt.begin(DEVICE_ID, MQTT_BROKER_HOST, MQTT_BROKER_PORT,
                MQTT_USERNAME, MQTT_PASSWORD, MQTT_CA_CERT, onRemoteCommand);
    _mqtt.update(millis(), _wifi.connected());
}

void SafeboxApp::update() {
    uint32_t now = millis();

    // Local safety is deliberately evaluated before network maintenance.
    updateSensors(now);
    bool wasActive = _edgeSafety.active();
    _edgeSafety.update(now);
    if (wasActive && !_edgeSafety.active()) {
        _oled.showStatus("Connected", _wifi.ipAddress(), DEVICE_ID);
    }

    updateConnectivity(now);
    publishPeriodicTelemetry(now);
}

void SafeboxApp::onApMode(WiFiManager*) {
    if (_instance) {
        _instance->_oled.showStatus("AP Mode: Safebox-AP", "Open 192.168.4.1");
    }
}

void SafeboxApp::onRemoteCommand(const char* actuator, bool state) {
    if (_instance) _instance->_remoteControl.handleCommand(actuator, state);
}

void SafeboxApp::updateSensors(uint32_t nowMs) {
    _pir.update(nowMs);
    _state.sensors.motionDetected = _pir.detected();

    if (nowMs - _lastGasReadMs >= GAS_INTERVAL_MS) {
        _lastGasReadMs = nowMs;
        _state.sensors.gasLevel = _mq2.read();
        _state.sensors.gasValid = _mq2.valid();
    }
}

void SafeboxApp::updateConnectivity(uint32_t nowMs) {
    _wifi.update(nowMs, WIFI_RECONNECT_MS);
    _statusLed.set(_wifi.connected());
    _mqtt.update(nowMs, _wifi.connected());
}

void SafeboxApp::publishPeriodicTelemetry(uint32_t nowMs) {
    if (nowMs - _lastTelemetryMs < TELEMETRY_INTERVAL_MS) return;
    _lastTelemetryMs = nowMs;

    if (_dht22.read()) {
        _state.sensors.temperature = _dht22.temperature();
        _state.sensors.humidity = _dht22.humidity();
    }
    _telemetry.publish();

    if (_edgeSafety.active()) {
        _oled.showGasWarning(_state.sensors.gasLevel, GAS_ALERT_THRESHOLD);
    }
}
