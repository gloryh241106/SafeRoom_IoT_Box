#include "active_buzzer.h"

ActiveBuzzer::ActiveBuzzer(uint8_t pin, bool activeLow)
    : _pin(pin), _activeLow(activeLow) {}

void ActiveBuzzer::begin() {
    digitalWrite(_pin, _activeLow ? HIGH : LOW);
    pinMode(_pin, OUTPUT);
}

void ActiveBuzzer::set(bool on) {
    _on = on;
    digitalWrite(_pin, (on != _activeLow) ? HIGH : LOW);
}

bool ActiveBuzzer::isOn() const {
    return _on;
}
