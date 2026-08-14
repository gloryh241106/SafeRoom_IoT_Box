#pragma once

#include <Arduino.h>

/** Reads the HIGH/LOW motion state from the PIR sensor. */
class PirSensor {
public:
    /** Stores the GPIO connected to PIR OUT. */
    explicit PirSensor(uint8_t pin);

    /** Configures the PIR pin as an input. */
    void begin();

    /** Returns true while the PIR output is HIGH. */
    bool motionDetected() const;

private:
    uint8_t _pin;
};
