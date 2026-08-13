#pragma once

#include <Arduino.h>

class Led {
public:
    explicit Led(uint8_t pin);
    void begin();
    void set(bool on);
    bool isOn() const;

private:
    uint8_t _pin;
    bool _on = false;
};
