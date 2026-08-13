#include "edge_safety.h"
#include "../config/settings.h"

EdgeSafety::EdgeSafety(ActiveBuzzer& buzzer, Led& alertLed, OledDisplay& oled,
                       RemoteControl& remoteControl, Telemetry& telemetry,
                       DeviceState& state)
    : _buzzer(buzzer), _alertLed(alertLed), _oled(oled),
      _remoteControl(remoteControl), _telemetry(telemetry), _state(state) {}

void EdgeSafety::update(uint32_t nowMs) {
    int gas = _state.sensors.gasLevel;

    if (!_active && _state.sensors.gasValid && gas > GAS_ALERT_THRESHOLD) {
        trigger(nowMs);
    } else if (_active && gas < GAS_CLEAR_THRESHOLD) {
        release();
        return;
    }

    if (!_active) return;

    _alertLed.set(true);
    _state.actuators.alertLedOn = true;

    if (nowMs - _lastBeepMs >= BEEP_INTERVAL_MS) {
        _lastBeepMs = nowMs;
        _buzzer.set(!_buzzer.isOn());
        _state.actuators.buzzerOn = _buzzer.isOn();
    }
    if (nowMs - _lastAlertMs >= ALERT_REPEAT_MS) {
        _lastAlertMs = nowMs;
        _telemetry.publishEdgeAlert(gas, GAS_ALERT_THRESHOLD);
    }
}

bool EdgeSafety::active() const {
    return _active;
}

void EdgeSafety::trigger(uint32_t nowMs) {
    _active = true;
    _remoteControl.setSafetyOverride(true);
    _alertLed.set(true);
    _buzzer.set(true);
    _state.actuators.alertLedOn = true;
    _state.actuators.buzzerOn = true;
    _lastBeepMs = nowMs;
    _lastAlertMs = nowMs;
    _oled.showGasWarning(_state.sensors.gasLevel, GAS_ALERT_THRESHOLD);
    _telemetry.publishEdgeAlert(_state.sensors.gasLevel, GAS_ALERT_THRESHOLD);
    DBGLN("[Safety] Gas alarm ON");
}

void EdgeSafety::release() {
    _active = false;
    _remoteControl.setSafetyOverride(false);
    DBGLN("[Safety] Gas alarm OFF");
}
