#include "mq2_sensor.h"

namespace {
    // Module load resistor (kOhm). Most MQ2 breakout boards use 1 kOhm.
    constexpr float RL_OHM = 1000.0f;
    // ESP32 ADC reference voltage (3.3V rail).
    constexpr float VCC_V = 3.3f;
    // Clean-air ratio Rs/Ro per MQ2 datasheet (approx. 9.5 - 10).
    constexpr float CLEAN_AIR_RATIO = 9.5f;
    // (PPM, Rs/Ro) points sampled from the MQ2 datasheet smoke/LPG curve.
    constexpr uint8_t CURVE_POINTS = 7;
    const float CURVE_PPM[CURVE_POINTS] = {200.0f, 300.0f, 500.0f, 1000.0f, 3000.0f, 5000.0f, 10000.0f};
    const float CURVE_RATIO[CURVE_POINTS] = {0.53f, 0.42f, 0.32f, 0.22f, 0.12f, 0.09f, 0.06f};
}

MQ2Sensor::MQ2Sensor(uint8_t pin) : _pin(pin), _raw(0.0f), _ppm(0.0f), _ro(1.0f) {}

void MQ2Sensor::begin() {
    pinMode(_pin, INPUT);

    // Calibrate Ro from a short clean-air sampling window.
    float avgRaw = readAverageRaw(32);
    if (avgRaw > 0.0f) {
        float vout = avgRaw / 4095.0f * VCC_V;
        float rs = (VCC_V / vout - 1.0f) * RL_OHM;
        _ro = rs / CLEAN_AIR_RATIO;
        if (_ro <= 0.0f) _ro = 1.0f;
    }
}

bool MQ2Sensor::read() {
    _raw = readAverageRaw(8);
    if (_raw <= 0.0f) return false;

    float vout = _raw / 4095.0f * VCC_V;
    float rs = (VCC_V / vout - 1.0f) * RL_OHM;
    _ppm = ppmFromRatio(rs / _ro);
    return true;
}

float MQ2Sensor::getRaw() const {
    return _raw;
}

float MQ2Sensor::getPpm() const {
    return _ppm;
}

float MQ2Sensor::readAverageRaw(uint8_t samples) {
    uint32_t sum = 0;
    for (uint8_t i = 0; i < samples; i++) {
        sum += analogRead(_pin);
        delayMicroseconds(50);
    }
    return sum / static_cast<float>(samples);
}

float MQ2Sensor::ppmFromRatio(float ratio) const {
    if (ratio <= 0.0f) return 0.0f;
    if (ratio >= CURVE_RATIO[0]) return CURVE_PPM[0];   // clean air -> baseline
    if (ratio <= CURVE_RATIO[CURVE_POINTS - 1]) return CURVE_PPM[CURVE_POINTS - 1];

    // Piecewise log-log interpolation: log(PPM) = a + b * log(ratio)
    for (uint8_t i = 1; i < CURVE_POINTS; i++) {
        if (ratio <= CURVE_RATIO[i - 1] && ratio >= CURVE_RATIO[i]) {
            float logPpmLow = logf(CURVE_PPM[i - 1]);
            float logPpmHigh = logf(CURVE_PPM[i]);
            float logRatioLow = logf(CURVE_RATIO[i - 1]);
            float logRatioHigh = logf(CURVE_RATIO[i]);
            float logRatio = logf(ratio);
            return expf(logPpmLow + (logRatio - logRatioLow) * (logPpmHigh - logPpmLow) / (logRatioHigh - logRatioLow));
        }
    }
    return CURVE_PPM[CURVE_POINTS - 1];
}
