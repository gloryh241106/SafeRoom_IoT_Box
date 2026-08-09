#include "edge_safety.h"
#include "../config/config.h"
#include <ArduinoJson.h>

EdgeSafety::EdgeSafety(Buzzer& buzzer, Led& alertLed, MqttClient& mqtt, OledDisplay& oled)
    : _buzzer(buzzer), _alertLed(alertLed), _mqtt(mqtt), _oled(oled) {}

void EdgeSafety::update(float gasPpm, unsigned long long timestampMs) {
    _lastGasPpm = gasPpm;
    _timestampMs = timestampMs;

    if (gasPpm > GAS_ALERT_THRESHOLD_PPM) {
        if (!_active) trigger();
        liveAlarm();
    } else if (_active && gasPpm < GAS_CLEAR_THRESHOLD_PPM) {
        release();
    }
}

bool EdgeSafety::isActive() const {
    return _active;
}

void EdgeSafety::trigger() {
    _active = true;
    _beepPhase = false;
    _lastBeepToggleMs = 0;
    _lastAlertPublishMs = 0;  // publish immediately on breach
    DBGLN("[EdgeSafety] GAS BREACH detected locally!");
}

void EdgeSafety::liveAlarm() {
    _alertLed.on();

    uint32_t now = millis();
    if (now - _lastBeepToggleMs >= EDGE_BEEP_TOGGLE_MS) {
        _lastBeepToggleMs = now;
        _beepPhase = !_beepPhase;
        if (_beepPhase) _buzzer.alarmOn();
        else _buzzer.alarmOff();
    }

    if (now - _lastAlertPublishMs >= EDGE_RETRIGGER_ALERT_MS) {
        _lastAlertPublishMs = now;
        publishAlert();
    }

    _oled.setMode(DisplayMode::WARNING);
}

void EdgeSafety::release() {
    if (!_active) return;
    _active = false;
    _beepPhase = false;

    // Restore remote-commanded actuator states now the local alert is over.
    if (_remoteBuzzer) _buzzer.alarmOn();
    else _buzzer.alarmOff();
    if (_remoteAlertLed) _alertLed.on();
    else _alertLed.off();

    DBGLN("[EdgeSafety] Gas back to normal; local alert cleared.");
}

void EdgeSafety::publishAlert() {
    JsonDocument doc;
    doc["type"] = "EDGE_SAFETY_TRIGGER";
    doc["sensorType"] = "gasLevel";
    doc["observedValue"] = static_cast<double>(_lastGasPpm);
    doc["threshold"] = static_cast<double>(GAS_ALERT_THRESHOLD_PPM);
    if (_timestampMs > 0) doc["timestamp"] = _timestampMs;

    char buffer[256];
    serializeJson(doc, buffer, sizeof(buffer));
    if (_mqtt.publishAlert(buffer)) {
        DBGLN("[EdgeSafety] Alert published to safebox/.../alerts");
    }
}

void EdgeSafety::applyRemoteBuzzer(bool on) {
    _remoteBuzzer = on;
    if (!_active) { // edge safety overrides remote commands
        if (on) _buzzer.alarmOn();
        else _buzzer.alarmOff();
    }
    DBG("[Buzzer] Remote state: %s\n", on ? "ON" : "OFF");
}

void EdgeSafety::applyRemoteAlertLed(bool on) {
    _remoteAlertLed = on;
    if (!_active) { // edge safety overrides remote commands
        if (on) _alertLed.on();
        else _alertLed.off();
    }
    DBG("[AlertLED] Remote state: %s\n", on ? "ON" : "OFF");
}