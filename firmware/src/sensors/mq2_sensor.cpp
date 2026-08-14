#include "mq2_sensor.h"

// Stores the configured ADC pin instead of hard-coding GPIO34.
Mq2Sensor::Mq2Sensor(uint8_t pin) : _pin(pin) {}

// Selects 12-bit resolution and 11 dB attenuation.
void Mq2Sensor::begin() {
    pinMode(_pin, INPUT);
    analogReadResolution(12);
    analogSetPinAttenuation(_pin, ADC_11db);
}

// Performs one raw analog read without filtering or PPM conversion.
uint16_t Mq2Sensor::readRaw() const {
    return static_cast<uint16_t>(analogRead(_pin));
}
