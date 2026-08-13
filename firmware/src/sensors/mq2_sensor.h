#pragma once

#include <Arduino.h>

class Mq2Sensor {
public:
    explicit Mq2Sensor(uint8_t pin);
    void begin();
    int read();
    int value() const;
    bool valid() const;

private:
    uint8_t _pin;
    int _value = 0;
    bool _valid = false;
};
