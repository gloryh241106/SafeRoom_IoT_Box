#include "relay.h"
#include "../config/config.h"

Relay::Relay(uint8_t pin) : _pin(pin), _state(false) {}

void Relay::begin() {
    pinMode(_pin, OUTPUT);
    off();  // relay open at boot (fan off)
}

void Relay::on() {
    digitalWrite(_pin, RELAY_ACTIVE_LOW ? LOW : HIGH);
    _state = true;
}

void Relay::off() {
    digitalWrite(_pin, RELAY_ACTIVE_LOW ? HIGH : LOW);
    _state = false;
}

void Relay::toggle() {
    if (_state)
        off();
    else
        on();
}

bool Relay::isOn() const {
    return _state;
}