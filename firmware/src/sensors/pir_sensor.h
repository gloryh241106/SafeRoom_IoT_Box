#pragma once

#include <Arduino.h>

class PirSensor {
public:
    PirSensor(uint8_t pin, uint32_t latchMs);
    void begin();
    void update(uint32_t nowMs);
    bool detected() const;

private:
    static void IRAM_ATTR onRising();

    uint8_t _pin;
    uint32_t _latchMs;
    uint32_t _lastMotionMs = 0;
    bool _detected = false;
    volatile bool _triggered = false;
    static PirSensor* _instance;
};
