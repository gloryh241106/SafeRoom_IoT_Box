#include "led.h"

Led::Led(uint8_t pin) : _pin(pin) {}

void Led::begin() {
    digitalWrite(_pin, LOW);
    pinMode(_pin, OUTPUT);
}

void Led::set(bool on) {
    _on = on;
    digitalWrite(_pin, on ? HIGH : LOW);
}

bool Led::isOn() const {
    return _on;
}
