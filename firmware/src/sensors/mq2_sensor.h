#ifndef __MQ2_SENSOR_H__
#define __MQ2_SENSOR_H__

#pragma once

#include <Arduino.h>
#include <Preferences.h>

enum class MQ2State {
    BURN_IN,
    WARMING_UP,
    CALIBRATING,
    READY,
    FAULT
};

/*
 * MQ2 Gas/Smoke Sensor (analog, ADC1_CH6 -> GPIO 34)
 *
 * Reads calibrated ESP32 ADC millivolts and estimates LPG-equivalent PPM
 * using the manufacturer Rs/Ro logarithmic curve:
 *
 *   Vout = Vadc / external-divider-ratio
 *   Rs = (Vc / Vout - 1) * RL             (sensor resistance)
 *   Ro = Rs in stable clean air             (persisted in NVS)
 *   PPM = piecewise log-log interpolation on the (PPM, Rs/Ro) curve
 *
 * A first-time sensor burns in for 48 powered hours, then calibrates over a
 * stable clean-air window. Later boots reuse Ro after a short warm-up. Until
 * READY, PPM is unavailable and only a conservative local raw-voltage alarm
 * remains active; uncalibrated cloud/email alerts are suppressed.
 */
class MQ2Sensor {
public:
    explicit MQ2Sensor(uint8_t pin);

    void begin();
    bool read();               // non-blocking lifecycle + sample update
    float getRaw() const;      // 0..4095 ADC raw value
    float getPpm() const;      // LPG-equivalent PPM; valid only when READY
    uint32_t getAdcMillivolts() const;
    float getSourceMillivolts() const;
    float getRo() const;
    float getResistanceRatio() const;
    uint32_t getBurnInRemainingSeconds() const;
    MQ2State getState() const;
    const char* getStateName() const;
    bool isReady() const;
    bool isRawDanger() const;

private:
    bool sampleAnalog();
    void updateLifecycle(uint32_t nowMs);
    void addCalibrationSample(float sensorResistance, uint32_t nowMs);
    bool saveCalibration(float ro);
    bool hasValidCalibration(float ro) const;
    float sensorResistance(float sourceMillivolts) const;
    float ppmFromRatio(float ratio) const;

    uint8_t _pin;
    float _raw;
    float _ppm;
    uint32_t _adcMillivolts = 0;
    float _sourceMillivolts = 0.0f;
    float _ro;
    float _resistanceRatio = 0.0f;
    bool _hasCalibration = false;
    bool _sampleValid = false;
    MQ2State _state = MQ2State::BURN_IN;
    MQ2State _stateBeforeFault = MQ2State::BURN_IN;

    Preferences _preferences;
    uint32_t _burnInAccumulatedMs = 0;
    uint32_t _lastLifecycleMs = 0;
    uint32_t _lastBurnInCheckpointMs = 0;
    uint32_t _warmupStartedMs = 0;

    uint32_t _calibrationStartedMs = 0;
    uint32_t _lastCalibrationSampleMs = 0;
    uint16_t _calibrationSamples = 0;
    double _calibrationMean = 0.0;
    double _calibrationM2 = 0.0;
};

#endif // __MQ2_SENSOR_H__
