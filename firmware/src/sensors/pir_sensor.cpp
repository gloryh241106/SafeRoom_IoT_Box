#include "pir_sensor.h"
#include "../config/config.h"

PIRSensor* PIRSensor::_instance = nullptr;

PIRSensor::PIRSensor(uint8_t pin)
    : _pin(pin),
      _motionDetected(false),
      _motionLatched(false),
      _motionLatchedAtMs(0) {}

void PIRSensor::begin() {
    pinMode(_pin, INPUT);
    _instance = this;
    attachInterrupt(digitalPinToInterrupt(_pin), onMotionRising, RISING);
}

bool PIRSensor::read() {
    uint32_t nowMs = millis();

    // Re-latch while the PIR output is still HIGH (extends the latch window).
    if (digitalRead(_pin) == HIGH) {
        _motionLatched = true;
        _motionLatchedAtMs = nowMs;
    }

    // Clear only after the pin went LOW and the latch window expired.
    if (_motionLatched && nowMs - _motionLatchedAtMs >= MOTION_LATCH_MS) {
        _motionLatched = false;
    }

    _motionDetected = _motionLatched;
    return _motionDetected;
}

bool PIRSensor::isMotionDetected() const {
    return _motionDetected;
}

void IRAM_ATTR PIRSensor::onMotionRising() {
    if (_instance) _instance->latchMotion();
}

void PIRSensor::latchMotion() {
    _motionLatched = true;
    _motionLatchedAtMs = millis();
}
