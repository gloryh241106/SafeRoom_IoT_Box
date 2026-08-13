#include "dht22_sensor.h"

Dht22Sensor::Dht22Sensor(uint8_t pin) : _sensor(pin, DHT22) {}

void Dht22Sensor::begin() {
    _sensor.begin();
}

bool Dht22Sensor::read() {
    float nextTemperature = _sensor.readTemperature();
    float nextHumidity = _sensor.readHumidity();
    if (isnan(nextTemperature) || isnan(nextHumidity)) return false;

    _temperature = nextTemperature;
    _humidity = nextHumidity;
    return true;
}

float Dht22Sensor::temperature() const {
    return _temperature;
}

float Dht22Sensor::humidity() const {
    return _humidity;
}
