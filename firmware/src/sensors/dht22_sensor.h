#pragma once

#include <Arduino.h>
#include <DHT.h>

/**
 * Reads temperature and humidity from the DHT22.
 * This module does not handle MQTT or display output.
 */
class Dht22Sensor {
public:
    /** Stores the DHT22 data GPIO. */
    explicit Dht22Sensor(uint8_t pin);

    /** Starts the DHT library once during setup. */
    void begin();

    /**
     * Reads one temperature and humidity sample.
     * @return true when both values are valid.
     */
    bool read(float& temperature, float& humidity);

private:
    DHT _dht;
};
