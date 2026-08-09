#ifndef __DHT_SENSOR_H__
#define __DHT_SENSOR_H__

#pragma once

#include <Arduino.h>
#include <DHT.h>

class DHTSensor {
public:
    explicit DHTSensor(uint8_t pin);
    void begin();
    bool read();
    float getTemperature() const;
    float getHumidity() const;

private:
    DHT _dht;
    float _temperature;
    float _humidity;
};

#endif // __DHT_SENSOR_H__