#include "pir_sensor.h"

// Stores the PIR output pin.
PirSensor::PirSensor(uint8_t pin) : _pin(pin) {}

// Configures the PIR output as a digital input.
void PirSensor::begin() {
    pinMode(_pin, INPUT);
}

// Returns the current signal without a software motion latch.
bool PirSensor::motionDetected() const {
    return digitalRead(_pin) == HIGH;
}
