#pragma once

#include "../app/device_state.h"
#include "../connectivity/mqtt_client.h"

class Telemetry {
public:
    Telemetry(SafeboxMqttClient& mqtt, DeviceState& state, const char* deviceId);
    bool publish();
    bool publishEdgeAlert(int gasValue, int threshold);

private:
    static unsigned long long epochMs();

    SafeboxMqttClient& _mqtt;
    DeviceState& _state;
    const char* _deviceId;
};
