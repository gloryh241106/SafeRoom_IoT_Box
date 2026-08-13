#pragma once

#include <Arduino.h>

class FanRelay {
public:
    FanRelay(uint8_t pin, bool activeLow);
    void begin();
    void set(bool on);
    bool isOn() const;

private:
    uint8_t _pin;
    bool _activeLow;
    bool _on = false;
};
