#ifndef __BUZZER_H__
#define __BUZZER_H__

#pragma once

#include <Arduino.h>

/*
 * Active Buzzer (GPIO 19, PWM via LEDC).
 *
 * Uses a dedicated LEDC channel to drive the buzzer at a fixed tone
 * frequency. alarmOn()/alarmOff() support the edge-local safety beep
 * pattern; the main loop toggles alarmOn()/alarmOff() every 500 ms to
 * create an audible intermittent alert.
 */
class Buzzer {
public:
    explicit Buzzer(uint8_t pin);
    void begin();
    void alarmOn();
    void alarmOff();
    bool isAlarming() const;

private:
    uint8_t _pin;
    bool _active;
};

#endif // __BUZZER_H__
