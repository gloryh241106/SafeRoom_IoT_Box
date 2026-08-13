#include "fan_relay.h"

FanRelay::FanRelay(uint8_t pin, bool activeLow)
    : _pin(pin), _activeLow(activeLow) {}

void FanRelay::begin() {
    digitalWrite(_pin, _activeLow ? HIGH : LOW);
    pinMode(_pin, OUTPUT);
}

void FanRelay::set(bool on) {
    _on = on;
    digitalWrite(_pin, (on != _activeLow) ? HIGH : LOW);
}

bool FanRelay::isOn() const {
    return _on;
}
