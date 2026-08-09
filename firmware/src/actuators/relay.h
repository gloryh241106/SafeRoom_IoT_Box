#pragma once

#include <Arduino.h>

class Relay {
public:
    explicit Relay(uint8_t pin);
    void begin();
    void on();
    void off();
    void toggle();
    bool isOn() const;

private:
    uint8_t _pin;
    bool _state;
};