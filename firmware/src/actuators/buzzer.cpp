#include "buzzer.h"

Buzzer::Buzzer(uint8_t pin, bool activeLow)
    : _pin(pin), _activeLow(activeLow), _active(false) {}

void Buzzer::begin() {
    pinMode(_pin, OUTPUT);
    alarmOff();
}

void Buzzer::alarmOn() {
    digitalWrite(_pin, _activeLow ? LOW : HIGH);
    _active = true;
}

void Buzzer::alarmOff() {
    digitalWrite(_pin, _activeLow ? HIGH : LOW);
    _active = false;
}

bool Buzzer::isAlarming() const {
    return _active;
}
