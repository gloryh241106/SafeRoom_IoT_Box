#include "mq2_sensor.h"

Mq2Sensor::Mq2Sensor(uint8_t pin) : _pin(pin) {}

void Mq2Sensor::begin() {
    pinMode(_pin, INPUT);
    analogSetPinAttenuation(_pin, ADC_11db);
}

int Mq2Sensor::read() {
    _value = analogRead(_pin);
    _valid = true;
    return _value;
}

int Mq2Sensor::value() const {
    return _value;
}

bool Mq2Sensor::valid() const {
    return _valid;
}
