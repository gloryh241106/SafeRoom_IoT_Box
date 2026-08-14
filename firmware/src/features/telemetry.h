#pragma once

#include <ArduinoJson.h>

#include "../device_state.h"
#include "../network/mqtt_service.h"

/** Converts DeviceState into backend-compatible MQTT JSON. */
class Telemetry {
public:
    /** Stores the MQTT transport and payload device ID. */
    Telemetry(MqttService& mqtt, const char* deviceId);

    /** Builds and publishes one complete device snapshot. */
    bool publish(const DeviceState& state);

    /** Builds and publishes an MQ2 edge-safety event. */
    bool publishGasAlert(uint16_t observedRaw, uint16_t thresholdRaw);

private:
    // Separate writers keep packaging readable while producing one atomic JSON.
    /** Writes DHT22, MQ2, and PIR fields into metrics. */
    static void writeSensors(JsonObject metrics, const SensorState& sensors);

    /** Writes the fan state into actuatorStates. */
    static void writeFanState(JsonObject actuators, const ActuatorState& state);

    /** Writes the physical buzzer state into actuatorStates. */
    static void writeBuzzerState(JsonObject actuators, const ActuatorState& state);

    /** Writes the physical red LED state into actuatorStates. */
    static void writeAlertLedState(JsonObject actuators, const ActuatorState& state);

    /** Writes the local gas safety override into actuatorStates. */
    static void writeGasAlarmState(JsonObject actuators, const ActuatorState& state);

    /** Returns Unix milliseconds, or zero before NTP is valid. */
    static unsigned long long epochMilliseconds();

    MqttService& _mqtt;
    const char* _deviceId;
};
