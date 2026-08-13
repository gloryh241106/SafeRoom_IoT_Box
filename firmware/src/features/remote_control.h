#pragma once

#include "../app/device_state.h"
#include "../actuators/active_buzzer.h"
#include "../actuators/fan_relay.h"
#include "../actuators/led.h"

class RemoteControl {
public:
    RemoteControl(FanRelay& fan, ActiveBuzzer& buzzer, Led& alertLed, DeviceState& state);
    void handleCommand(const char* actuator, bool requestedState);
    void setSafetyOverride(bool active);

private:
    FanRelay& _fan;
    ActiveBuzzer& _buzzer;
    Led& _alertLed;
    DeviceState& _state;
    bool _safetyOverride = false;
    bool _remoteBuzzer = false;
    bool _remoteAlertLed = false;
};
