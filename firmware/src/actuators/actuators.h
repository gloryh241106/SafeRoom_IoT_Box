#pragma once

#include <Arduino.h>

#include "../device_state.h"

/**
 * Controls the fan relay, alert LED, and buzzer GPIOs.
 * The buzzer and alert LED follow only the local gas safety alarm.
 */
class Actuators {
public:
    /** Stores GPIO pins and active-low settings from config.h. */
    Actuators(uint8_t fanPin, uint8_t alertLedPin,
              uint8_t buzzerPin, bool fanActiveLow, bool buzzerActiveLow);

    /** Configures output pins and immediately applies safe OFF states. */
    void begin();

    /** Applies a remote fan command with the correct relay polarity. */
    void setFan(bool on);

    /** Enables or clears the local gas alarm override. */
    void setGasAlarm(bool active);

    /** Returns the final physical output states for telemetry. */
    ActuatorState snapshot() const;

private:
    /** Converts logical ON/OFF into the correct GPIO level. */
    static void writeOutput(uint8_t pin, bool on, bool activeLow);

    /** Writes stored states to GPIO; the caller must hold the spinlock. */
    void applyLocked();

    uint8_t _fanPin;
    uint8_t _alertLedPin;
    uint8_t _buzzerPin;
    bool _fanActiveLow;
    bool _buzzerActiveLow;

    mutable portMUX_TYPE _mux = portMUX_INITIALIZER_UNLOCKED; // Protects loop/task access.
    bool _fanOn = false;                // Remote fan request.
    bool _gasAlarm = false;             // Local safety override.
};
