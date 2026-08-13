#pragma once

#include <Arduino.h>
#include <DHT.h>

class Dht22Sensor {
public:
    explicit Dht22Sensor(uint8_t pin);
    void begin();
    bool read();
    float temperature() const;
    float humidity() const;

private:
    DHT _sensor;
    float _temperature = 0.0f;
    float _humidity = 0.0f;
};
