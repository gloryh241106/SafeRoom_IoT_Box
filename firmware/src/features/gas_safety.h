#pragma once

#include <Arduino.h>

#include "../actuators/actuators.h"
#include "../display/oled.h"
#include "../sensors/mq2_sensor.h"

/**
 * Runs MQ2 safety independently from WiFi and MQTT every 50 ms.
 * Three consecutive unsafe samples activate the buzzer within 150 ms; it
 * clears after three samples below 500 or after 5 s sustained below 600.
 */
class GasSafety {
public:
    /** Stores references to the sensor, outputs, and display. */
    GasSafety(Mq2Sensor& sensor, Actuators& actuators, OledDisplay& oled);

    /** Starts the priority-4 gas task and fails safe if creation fails. */
    bool begin();

    /** Returns the latest MQ2 sample through a protected mailbox. */
    uint16_t gasRaw() const;

    /** Reports whether at least one MQ2 sample has been read. */
    bool sampled() const;

    /** Reports whether the MQ2 heater warm-up window has elapsed. */
    bool stabilized() const;

    /** Returns the current local gas alarm state. */
    bool alarmActive() const;

    /**
     * Takes one new gas event for MQTT delivery.
     * @param observedRaw receives the ADC value that triggered the alarm.
     * @return true once for each OFF-to-ON alarm transition.
     */
    bool takeNewAlert(uint16_t& observedRaw);

private:
    /** Bridges the FreeRTOS C callback to the object method. */
    static void taskEntry(void* context);

    /** Samples MQ2 at a fixed task interval. */
    void run();

    /** Reads once, applies hysteresis, and updates outputs on state changes. */
    void sampleOnce();

    Mq2Sensor& _sensor;
    Actuators& _actuators;
    OledDisplay& _oled;
    TaskHandle_t _taskHandle = nullptr;
    mutable portMUX_TYPE _mux = portMUX_INITIALIZER_UNLOCKED; // Protects task-to-loop data.
    uint16_t _gasRaw = 0;        // Latest ADC sample.
    uint16_t _alertRaw = 0;      // First sample above the alarm limit.
    bool _sampled = false;       // True after the first real sample.
    bool _alarm = false;         // Current hysteresis state.
    bool _newAlert = false;      // Event waiting for main.cpp.
    uint8_t _highSamples = 0;    // Consecutive samples above 600.
    uint8_t _clearSamples = 0;   // Consecutive samples below 500.
    uint8_t _subAlarmSamples = 0; // Consecutive samples below 600 while alarming.
    uint32_t _startedAtMs = 0;   // Start of the ADC stabilization window.
};
