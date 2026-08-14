#pragma once

#include <Arduino.h>
#include <math.h>

/** Stores one snapshot of all sensor values. */
struct SensorState {
    float temperature = NAN;       // DHT22 temperature in degrees Celsius.
    float humidity = NAN;          // DHT22 relative humidity percentage.
    uint16_t gasRaw = 0;           // Raw MQ2 ADC value from 0 to 4095.
    uint16_t gasAlarmThreshold = 0; // Live edge alarm threshold currently in force.
    bool gasValid = false;         // True after the first MQ2 sample.
    bool motionDetected = false;   // Current PIR HIGH/LOW state.
    bool dhtValid = false;         // True when both DHT22 values are valid.
};

/** Stores the physical states applied to output devices. */
struct ActuatorState {
    bool fanOn = false;             // Current fan relay state.
    bool buzzerActive = false;      // Current physical buzzer state.
    bool alertLedActive = false;    // Current physical red LED state.
    bool gasAlarmActive = false;    // True while the local MQ2 safety override is active.
};

/** Combines sensor and actuator data for one telemetry message. */
struct DeviceState {
    SensorState sensors;
    ActuatorState actuators;
};
