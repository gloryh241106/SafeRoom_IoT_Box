#include "dht_sensor.h"

DHTSensor::DHTSensor(uint8_t pin) : _dht(pin, DHT22), _temperature(0.0f), _humidity(0.0f) {}

void DHTSensor::begin() {
    _dht.begin();
}

bool DHTSensor::read() {
    float t = _dht.readTemperature();
    float h = _dht.readHumidity();

    if (isnan(t) || isnan(h))
        return false;
    
    _temperature = t;
    _humidity = h;

    return true;
}

float DHTSensor::getTemperature() const {
    return _temperature;
}

float DHTSensor::getHumidity() const {
    return _humidity;
}