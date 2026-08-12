#ifndef __BUZZER_H__
#define __BUZZER_H__

#pragma once

#include <Arduino.h>

/*
 * Three-pin Active Buzzer module (GPIO 19 digital signal).
 *
 * The module contains its own oscillator, so firmware only enables or
 * disables its SIG/IN pin. Polarity is configurable for active-HIGH and
 * active-LOW boards. The edge-safety layer toggles alarmOn()/alarmOff()
 * every 500 ms to create an intermittent alert without PWM.
 */
class Buzzer {
public:
    Buzzer(uint8_t pin, bool activeLow);
    void begin();
    void alarmOn();
    void alarmOff();
    bool isAlarming() const;

private:
    uint8_t _pin;
    bool _activeLow;
    bool _active;
};

#endif // __BUZZER_H__
