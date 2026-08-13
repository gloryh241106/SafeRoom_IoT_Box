#include "remote_control.h"
#include <cstring>

RemoteControl::RemoteControl(FanRelay& fan, ActiveBuzzer& buzzer,
                             Led& alertLed, DeviceState& state)
    : _fan(fan), _buzzer(buzzer), _alertLed(alertLed), _state(state) {}

void RemoteControl::handleCommand(const char* actuator, bool requestedState) {
    if (strcmp(actuator, "fan") == 0) {
        _fan.set(requestedState); // fan is remote-only
        _state.actuators.fanOn = _fan.isOn();
    } else if (strcmp(actuator, "buzzer") == 0) {
        _remoteBuzzer = requestedState;
        if (!_safetyOverride) {
            _buzzer.set(requestedState);
            _state.actuators.buzzerOn = _buzzer.isOn();
        }
    } else if (strcmp(actuator, "alertLed") == 0) {
        _remoteAlertLed = requestedState;
        if (!_safetyOverride) {
            _alertLed.set(requestedState);
            _state.actuators.alertLedOn = _alertLed.isOn();
        }
    }
}

void RemoteControl::setSafetyOverride(bool active) {
    _safetyOverride = active;
    if (active) return;

    _buzzer.set(_remoteBuzzer);
    _alertLed.set(_remoteAlertLed);
    _state.actuators.buzzerOn = _buzzer.isOn();
    _state.actuators.alertLedOn = _alertLed.isOn();
}
