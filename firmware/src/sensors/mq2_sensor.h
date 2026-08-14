#pragma once

#include <Arduino.h>

/** Reads a direct 12-bit ADC value from the MQ2 analog output. */
class Mq2Sensor {
public:
    /** Stores the ADC pin connected to MQ2 AO. */
    explicit Mq2Sensor(uint8_t pin);

    /** Configures the GPIO, ADC resolution, and attenuation. */
    void begin();

    /** Returns one raw ADC sample from 0 to 4095 without PPM conversion. */
    uint16_t readRaw() const;

private:
    uint8_t _pin;
};
