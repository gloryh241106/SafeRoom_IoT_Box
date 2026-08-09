#ifndef __LED_H__
#define __LED_H__

#pragma once

#include <Arduino.h>

/*
 * Simple digital LED output (Status Green GPIO 17, Alert Red GPIO 18).
 * HIGH = LED on.
 */
class Led {
public:
    explicit Led(uint8_t pin);
    void begin();
    void on();
    void off();
    bool isOn() const;

private:
    uint8_t _pin;
    bool _state;
};

#endif // __LED_H__
