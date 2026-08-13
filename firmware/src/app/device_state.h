#pragma once

struct SensorState {
    float temperature = 0.0f;
    float humidity = 0.0f;
    int gasLevel = 0;
    bool gasValid = false;
    bool motionDetected = false;
};

struct ActuatorState {
    bool fanOn = false;
    bool buzzerOn = false;
    bool alertLedOn = false;
};

struct DeviceState {
    SensorState sensors;
    ActuatorState actuators;
};
