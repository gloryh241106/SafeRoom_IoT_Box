#pragma once

#include "../app/device_state.h"
#include "../actuators/active_buzzer.h"
#include "../actuators/led.h"
#include "../display/oled_display.h"
#include "remote_control.h"
#include "telemetry.h"

class EdgeSafety {
public:
    EdgeSafety(ActiveBuzzer& buzzer, Led& alertLed, OledDisplay& oled,
               RemoteControl& remoteControl, Telemetry& telemetry, DeviceState& state);
    void update(uint32_t nowMs);
    bool active() const;

private:
    void trigger(uint32_t nowMs);
    void release();

    ActiveBuzzer& _buzzer;
    Led& _alertLed;
    OledDisplay& _oled;
    RemoteControl& _remoteControl;
    Telemetry& _telemetry;
    DeviceState& _state;
    bool _active = false;
    uint32_t _lastBeepMs = 0;
    uint32_t _lastAlertMs = 0;
};
