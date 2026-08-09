#ifndef __MQ2_SENSOR_H__
#define __MQ2_SENSOR_H__

#pragma once

#include <Arduino.h>

/*
 * MQ2 Gas/Smoke Sensor (analog, ADC1_CH6 -> GPIO 34)
 *
 * Reads the analog voltage and estimates an equivalent PPM concentration
 * using the manufacturer Rs/Ro logarithmic curve for smoke/LPG:
 *
 *   Rs = (VCC / Vout - 1) * RL            (sensor resistance)
 *   Ro = Rs in clean air / CLEAN_AIR_RATIO (calibrated at boot)
 *   PPM = piecewise log-log interpolation on the (PPM, Rs/Ro) curve
 *
 * The PPM estimate is used for the edge-local safety rule
 * (gasLevel > GAS_ALERT_THRESHOLD_PPM -> < 200 ms buzzer + LED + OLED).
 */
class MQ2Sensor {
public:
    explicit MQ2Sensor(uint8_t pin);

    void begin();
    bool read();               // sample + update raw/PPM, true on success
    float getRaw() const;      // 0..4095 ADC raw value
    float getPpm() const;      // estimated PPM

private:
    float readAverageRaw(uint8_t samples);
    float ppmFromRatio(float ratio) const;

    uint8_t _pin;
    float _raw;
    float _ppm;
    float _ro;                 // calibrated sensor resistance in clean air
};

#endif // __MQ2_SENSOR_H__
