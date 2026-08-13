#include "edge_safety.h"
#include "../config/config.h"
#include <ArduinoJson.h>

EdgeSafety::EdgeSafety(Buzzer& buzzer, Led& alertLed, MqttClient& mqtt)
    : _buzzer(buzzer), _alertLed(alertLed), _mqtt(mqtt) {}

void EdgeSafety::update(float gasPpm,
                        bool gasReady,
                        uint32_t gasAdcMillivolts,
                        unsigned long long timestampMs) {
    _lastGasPpm = gasPpm;
    _lastGasAdcMillivolts = gasAdcMillivolts;
    _timestampMs = timestampMs;

    const bool calibratedDanger = gasReady && gasPpm > GAS_ALERT_THRESHOLD_PPM;
    const bool rawDanger = !gasReady && gasAdcMillivolts >= MQ2_RAW_ALERT_ADC_MV;
    const bool calibratedClear = gasReady && gasPpm < GAS_CLEAR_THRESHOLD_PPM;
    const bool rawClear = !gasReady && gasAdcMillivolts < MQ2_RAW_CLEAR_ADC_MV;

    if (calibratedDanger || rawDanger) {
        if (!_active) {
            _calibratedAlert = calibratedDanger;
            trigger();
        } else if (calibratedDanger && !_calibratedAlert) {
            _calibratedAlert = true;
            _lastAlertPublishMs = millis();
            queueCloudAlert();
        }
        liveAlarm();
    } else if (_active && (calibratedClear || rawClear)) {
        release();
    }
}

bool EdgeSafety::isActive() const {
    return _active;
}

void EdgeSafety::trigger() {
    _active = true;
    _beepPhase = true;
    _lastBeepToggleMs = millis();
    _lastAlertPublishMs = millis();
    _alertLed.on();
    _buzzer.alarmOn();
    if (_calibratedAlert) {
        DBGLN("[EdgeSafety] Calibrated gas breach detected locally!");
        queueCloudAlert();
    } else {
        DBGLN("[EdgeSafety] Raw MQ2 voltage breach during sensor preparation!");
    }
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

    // The high-priority safety task queues data but never performs network I/O.
    if (_calibratedAlert && now - _lastAlertPublishMs >= EDGE_RETRIGGER_ALERT_MS) {
        _lastAlertPublishMs = now;
        queueCloudAlert();
    }
}

void EdgeSafety::release() {
    if (!_active) return;
    _active = false;
    _beepPhase = false;
    _calibratedAlert = false;

    // Restore remote-commanded actuator states now the local alert is over.
    if (_remoteBuzzer) _buzzer.alarmOn();
    else _buzzer.alarmOff();
    if (_remoteAlertLed) _alertLed.on();
    else _alertLed.off();

    DBGLN("[EdgeSafety] Gas back to normal; local alert cleared.");
}

void EdgeSafety::queueCloudAlert() {
    portENTER_CRITICAL(&_stateMux);
    _pendingGasPpm = _lastGasPpm;
    _pendingTimestampMs = _timestampMs;
    _cloudAlertPending = true;
    _cloudAlertGeneration++;
    portEXIT_CRITICAL(&_stateMux);
}

void EdgeSafety::serviceCloudAlert() {
    if (!_cloudAlertPending || !_mqtt.isConnected()) return;

    float gasPpm;
    unsigned long long timestampMs;
    uint32_t generation;
    portENTER_CRITICAL(&_stateMux);
    gasPpm = _pendingGasPpm;
    timestampMs = _pendingTimestampMs;
    generation = _cloudAlertGeneration;
    portEXIT_CRITICAL(&_stateMux);

    if (!publishAlert(gasPpm, timestampMs)) return;

    // Do not erase a newer alert that was queued while MQTT was publishing.
    portENTER_CRITICAL(&_stateMux);
    if (_cloudAlertGeneration == generation) _cloudAlertPending = false;
    portEXIT_CRITICAL(&_stateMux);
}

bool EdgeSafety::publishAlert(float gasPpm, unsigned long long timestampMs) {
    JsonDocument doc;
    doc["type"] = "EDGE_SAFETY_TRIGGER";
    doc["sensorType"] = "gasLevel";
    doc["observedValue"] = static_cast<double>(gasPpm);
    doc["threshold"] = static_cast<double>(GAS_ALERT_THRESHOLD_PPM);
    doc["calibrated"] = true;
    if (timestampMs > 0) doc["timestamp"] = timestampMs;

    char buffer[256];
    serializeJson(doc, buffer, sizeof(buffer));
    if (_mqtt.publishAlert(buffer)) {
        DBGLN("[EdgeSafety] Alert published to safebox/.../alerts");
        return true;
    }
    return false;
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
