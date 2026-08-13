#pragma once

#include "device_state.h"
#include "../actuators/active_buzzer.h"
#include "../actuators/fan_relay.h"
#include "../actuators/led.h"
#include "../connectivity/mqtt_client.h"
#include "../connectivity/wifi_manager.h"
#include "../display/oled_display.h"
#include "../features/edge_safety.h"
#include "../features/remote_control.h"
#include "../features/telemetry.h"
#include "../sensors/dht22_sensor.h"
#include "../sensors/mq2_sensor.h"
#include "../sensors/pir_sensor.h"

class SafeboxApp {
public:
    SafeboxApp();
    void begin();
    void update();

private:
    static void onApMode(WiFiManager* manager);
    static void onRemoteCommand(const char* actuator, bool state);
    void updateSensors(uint32_t nowMs);
    void updateConnectivity(uint32_t nowMs);
    void publishPeriodicTelemetry(uint32_t nowMs);

    DeviceState _state;

    Dht22Sensor _dht22;
    Mq2Sensor _mq2;
    PirSensor _pir;

    FanRelay _fanRelay;
    ActiveBuzzer _buzzer;
    Led _statusLed;
    Led _alertLed;

    OledDisplay _oled;
    SafeboxWifiManager _wifi;
    SafeboxMqttClient _mqtt;

    RemoteControl _remoteControl;
    Telemetry _telemetry;
    EdgeSafety _edgeSafety;

    uint32_t _lastGasReadMs = 0;
    uint32_t _lastTelemetryMs = 0;
    static SafeboxApp* _instance;
};
