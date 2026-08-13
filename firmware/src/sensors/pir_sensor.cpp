#include "pir_sensor.h"

PirSensor* PirSensor::_instance = nullptr;

PirSensor::PirSensor(uint8_t pin, uint32_t latchMs)
    : _pin(pin), _latchMs(latchMs) {}

void PirSensor::begin() {
    _instance = this;
    pinMode(_pin, INPUT);
    attachInterrupt(digitalPinToInterrupt(_pin), onRising, RISING);
}

void PirSensor::update(uint32_t nowMs) {
    if (_triggered || digitalRead(_pin) == HIGH) {
        _triggered = false;
        _lastMotionMs = nowMs;
        _detected = true;
    } else if (_detected && nowMs - _lastMotionMs >= _latchMs) {
        _detected = false;
    }
}

bool PirSensor::detected() const {
    return _detected;
}

void IRAM_ATTR PirSensor::onRising() {
    if (_instance) _instance->_triggered = true;
}
