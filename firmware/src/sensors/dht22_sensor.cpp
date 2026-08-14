#include "dht22_sensor.h"

// Creates a DHT22 driver on the selected GPIO.
Dht22Sensor::Dht22Sensor(uint8_t pin) : _dht(pin, DHT22) {}

// Starts the library without taking a measurement.
void Dht22Sensor::begin() {
    _dht.begin();
}

// Reads both values and treats NaN as a failed sample.
bool Dht22Sensor::read(float& temperature, float& humidity) {
    temperature = _dht.readTemperature();
    humidity = _dht.readHumidity();
    return !isnan(temperature) && !isnan(humidity);
}
