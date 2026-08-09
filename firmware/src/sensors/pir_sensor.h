#ifndef __PIR_SENSOR_H__
#define __PIR_SENSOR_H__

#pragma once

#include <Arduino.h>

/*
 * PIR HC-SR501 Motion Sensor (GPIO 13, digital interrupt).
 *
 * Attaches a RISING (LOW->HIGH) interrupt so motion is latched immediately,
 * independent of the 2s telemetry polling interval. The latch stays set for
 * MOTION_LATCH_MS while the PIR output holds HIGH and is cleared only after
 * the pin returns LOW and the latch window has expired.
 */
class PIRSensor {
public:
    explicit PIRSensor(uint8_t pin);
    void begin();
    bool read();                  // refresh state from pin + latch
    bool isMotionDetected() const;

private:
    static void IRAM_ATTR onMotionRising(); // ISR trampoline
    void latchMotion();

    uint8_t _pin;
    bool _motionDetected;
    volatile bool _motionLatched;
    volatile uint32_t _motionLatchedAtMs;
    static PIRSensor* _instance;  // single instance for the static ISR
};

#endif // __PIR_SENSOR_H__
