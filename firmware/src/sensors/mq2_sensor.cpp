#include "mq2_sensor.h"

#include <math.h>

#include "../config/config.h"

namespace {
    constexpr uint8_t ADC_SAMPLES = 8;
    constexpr uint8_t CALIBRATION_VERSION = 1;
    constexpr float MIN_VALID_RO_OHM = 10.0f;
    constexpr float MAX_VALID_RO_OHM = 1000000.0f;

    // LPG-equivalent points sampled from the MQ-2 Rs/R0 sensitivity curve.
    // R0 is resistance in clean air, matching the Winsen datasheet definition.
    constexpr uint8_t CURVE_POINTS = 4;
    const float CURVE_PPM[CURVE_POINTS] = {
        300.0f, 1000.0f, 5000.0f, 10000.0f
    };
    const float CURVE_RATIO[CURVE_POINTS] = {
        0.30f, 0.09f, 0.027f, 0.018f
    };
}

MQ2Sensor::MQ2Sensor(uint8_t pin) : _pin(pin), _raw(0.0f), _ppm(0.0f), _ro(0.0f) {}

void MQ2Sensor::begin() {
    pinMode(_pin, INPUT);
    analogReadResolution(12);
    analogSetPinAttenuation(_pin, ADC_11db);

    _preferences.begin("mq2cal", false);
    const uint8_t storedVersion = _preferences.getUChar("version", 0);
    const float storedRo = _preferences.getFloat("ro", 0.0f);
    _hasCalibration = storedVersion == CALIBRATION_VERSION && hasValidCalibration(storedRo);
    _ro = _hasCalibration ? storedRo : 0.0f;
    const uint32_t burnInTargetMs = static_cast<uint32_t>(MQ2_FIRST_BURN_IN_MS);
    _burnInAccumulatedMs = _hasCalibration
        ? burnInTargetMs
        : min(_preferences.getULong("burn_ms", 0), burnInTargetMs);

    const uint32_t nowMs = millis();
    _lastLifecycleMs = nowMs;
    _lastBurnInCheckpointMs = nowMs;
    _warmupStartedMs = nowMs;
    _state = (_hasCalibration || _burnInAccumulatedMs >= burnInTargetMs)
        ? MQ2State::WARMING_UP
        : MQ2State::BURN_IN;
    _stateBeforeFault = _state;

    DBG("[MQ2] State=%s, stored Ro=%.2f ohm, burn-in=%lu/%lu s\n",
        getStateName(), _ro,
        _burnInAccumulatedMs / 1000UL,
        MQ2_FIRST_BURN_IN_MS / 1000UL);
}

bool MQ2Sensor::read() {
    const uint32_t nowMs = millis();
    _sampleValid = sampleAnalog();

    if (!_sampleValid) {
        if (_state != MQ2State::FAULT) _stateBeforeFault = _state;
        _state = MQ2State::FAULT;
        _ppm = 0.0f;
        _resistanceRatio = 0.0f;
        return false;
    }

    if (_state == MQ2State::FAULT) _state = _stateBeforeFault;
    updateLifecycle(nowMs);

    const float rs = sensorResistance(_sourceMillivolts);
    if (!isfinite(rs) || rs <= 0.0f) {
        _stateBeforeFault = _state;
        _state = MQ2State::FAULT;
        _ppm = 0.0f;
        _resistanceRatio = 0.0f;
        return false;
    }

    if (_state == MQ2State::CALIBRATING) addCalibrationSample(rs, nowMs);

    if (isReady()) {
        _resistanceRatio = rs / _ro;
        _ppm = ppmFromRatio(_resistanceRatio);
    } else {
        _resistanceRatio = 0.0f;
        _ppm = 0.0f;
    }
    return true;
}

bool MQ2Sensor::sampleAnalog() {
    uint32_t rawSum = 0;
    uint32_t millivoltSum = 0;
    for (uint8_t i = 0; i < ADC_SAMPLES; i++) {
        rawSum += analogRead(_pin);
        millivoltSum += analogReadMilliVolts(_pin);
        delayMicroseconds(50);
    }

    _raw = rawSum / static_cast<float>(ADC_SAMPLES);
    _adcMillivolts = millivoltSum / ADC_SAMPLES;
    _sourceMillivolts = _adcMillivolts / MQ2_ADC_DIVIDER_RATIO;

    return _adcMillivolts >= MQ2_ADC_VALID_MIN_MV
        && _adcMillivolts <= MQ2_ADC_VALID_MAX_MV
        && _sourceMillivolts < MQ2_CIRCUIT_VOLTAGE_MV;
}

void MQ2Sensor::updateLifecycle(uint32_t nowMs) {
    const uint32_t elapsedMs = nowMs - _lastLifecycleMs;
    _lastLifecycleMs = nowMs;

    if (!_hasCalibration && _state == MQ2State::BURN_IN) {
        const uint32_t burnInTargetMs = static_cast<uint32_t>(MQ2_FIRST_BURN_IN_MS);
        const uint32_t remainingMs = burnInTargetMs - _burnInAccumulatedMs;
        _burnInAccumulatedMs += min(elapsedMs, remainingMs);

        if (nowMs - _lastBurnInCheckpointMs >= MQ2_BURN_IN_CHECKPOINT_MS
            || _burnInAccumulatedMs >= burnInTargetMs) {
            _preferences.putULong("burn_ms", _burnInAccumulatedMs);
            _lastBurnInCheckpointMs = nowMs;
        }

        if (_burnInAccumulatedMs >= burnInTargetMs) {
            _state = MQ2State::CALIBRATING;
            _calibrationStartedMs = nowMs;
            _lastCalibrationSampleMs = 0;
            _calibrationSamples = 0;
            _calibrationMean = 0.0;
            _calibrationM2 = 0.0;
            DBGLN("[MQ2] Burn-in complete; starting stable clean-air calibration.");
        }
        return;
    }

    if (_state == MQ2State::WARMING_UP
        && nowMs - _warmupStartedMs >= MQ2_STARTUP_WARMUP_MS) {
        if (_hasCalibration) {
            _state = MQ2State::READY;
            DBG("[MQ2] Startup warm-up complete; using persisted Ro=%.2f ohm.\n", _ro);
        } else {
            _state = MQ2State::CALIBRATING;
            _calibrationStartedMs = nowMs;
            _lastCalibrationSampleMs = 0;
            _calibrationSamples = 0;
            _calibrationMean = 0.0;
            _calibrationM2 = 0.0;
            DBGLN("[MQ2] Reheated after burn-in; starting clean-air calibration.");
        }
    }
}

void MQ2Sensor::addCalibrationSample(float rs, uint32_t nowMs) {
    // A stable but polluted room must not be learned as the clean-air R0.
    if (_adcMillivolts >= MQ2_RAW_CLEAR_ADC_MV) {
        _calibrationStartedMs = nowMs;
        _lastCalibrationSampleMs = 0;
        _calibrationSamples = 0;
        _calibrationMean = 0.0;
        _calibrationM2 = 0.0;
        return;
    }

    if (_lastCalibrationSampleMs != 0
        && nowMs - _lastCalibrationSampleMs < MQ2_CALIBRATION_SAMPLE_MS) {
        return;
    }
    _lastCalibrationSampleMs = nowMs;

    _calibrationSamples++;
    const double delta = rs - _calibrationMean;
    _calibrationMean += delta / _calibrationSamples;
    const double delta2 = rs - _calibrationMean;
    _calibrationM2 += delta * delta2;

    if (nowMs - _calibrationStartedMs < MQ2_CALIBRATION_WINDOW_MS) return;

    const double variance = _calibrationSamples > 1
        ? _calibrationM2 / (_calibrationSamples - 1)
        : 0.0;
    const double coefficientOfVariation = _calibrationMean > 0.0
        ? sqrt(variance) / _calibrationMean
        : INFINITY;
    const bool stable = _calibrationSamples >= MQ2_CALIBRATION_MIN_SAMPLES
        && coefficientOfVariation <= MQ2_CALIBRATION_MAX_CV
        && hasValidCalibration(static_cast<float>(_calibrationMean));

    if (stable && saveCalibration(static_cast<float>(_calibrationMean))) {
        _state = MQ2State::READY;
        DBG("[MQ2] Calibration saved: Ro=%.2f ohm, CV=%.4f, samples=%u.\n",
            _ro, coefficientOfVariation, _calibrationSamples);
        return;
    }

    DBG("[MQ2] Clean-air signal not stable (CV=%.4f, samples=%u); retrying.\n",
        coefficientOfVariation, _calibrationSamples);
    _calibrationStartedMs = nowMs;
    _calibrationSamples = 0;
    _calibrationMean = 0.0;
    _calibrationM2 = 0.0;
}

bool MQ2Sensor::saveCalibration(float ro) {
    if (!hasValidCalibration(ro)) return false;
    const size_t roBytes = _preferences.putFloat("ro", ro);
    const size_t versionBytes = _preferences.putUChar("version", CALIBRATION_VERSION);
    if (roBytes != sizeof(float) || versionBytes != sizeof(uint8_t)) return false;

    _ro = ro;
    _hasCalibration = true;
    _preferences.putULong("burn_ms", MQ2_FIRST_BURN_IN_MS);
    return true;
}

bool MQ2Sensor::hasValidCalibration(float ro) const {
    return isfinite(ro) && ro >= MIN_VALID_RO_OHM && ro <= MAX_VALID_RO_OHM;
}

float MQ2Sensor::sensorResistance(float sourceMillivolts) const {
    if (sourceMillivolts <= 0.0f || sourceMillivolts >= MQ2_CIRCUIT_VOLTAGE_MV) {
        return NAN;
    }
    return (MQ2_CIRCUIT_VOLTAGE_MV / sourceMillivolts - 1.0f)
        * MQ2_EFFECTIVE_LOAD_OHM;
}

float MQ2Sensor::ppmFromRatio(float ratio) const {
    if (!isfinite(ratio) || ratio <= 0.0f) return 0.0f;
    if (ratio >= CURVE_RATIO[0]) return 0.0f; // below MQ-2 specified range
    if (ratio <= CURVE_RATIO[CURVE_POINTS - 1]) return CURVE_PPM[CURVE_POINTS - 1];

    for (uint8_t i = 1; i < CURVE_POINTS; i++) {
        if (ratio <= CURVE_RATIO[i - 1] && ratio >= CURVE_RATIO[i]) {
            const float logPpmLow = logf(CURVE_PPM[i - 1]);
            const float logPpmHigh = logf(CURVE_PPM[i]);
            const float logRatioLow = logf(CURVE_RATIO[i - 1]);
            const float logRatioHigh = logf(CURVE_RATIO[i]);
            const float logRatio = logf(ratio);
            return expf(logPpmLow
                + (logRatio - logRatioLow)
                * (logPpmHigh - logPpmLow)
                / (logRatioHigh - logRatioLow));
        }
    }
    return 0.0f;
}

float MQ2Sensor::getRaw() const { return _raw; }
float MQ2Sensor::getPpm() const { return _ppm; }
uint32_t MQ2Sensor::getAdcMillivolts() const { return _adcMillivolts; }
float MQ2Sensor::getSourceMillivolts() const { return _sourceMillivolts; }
float MQ2Sensor::getRo() const { return _ro; }
float MQ2Sensor::getResistanceRatio() const { return _resistanceRatio; }

uint32_t MQ2Sensor::getBurnInRemainingSeconds() const {
    if (_hasCalibration || _burnInAccumulatedMs >= MQ2_FIRST_BURN_IN_MS) return 0;
    return (MQ2_FIRST_BURN_IN_MS - _burnInAccumulatedMs + 999UL) / 1000UL;
}

MQ2State MQ2Sensor::getState() const { return _state; }

const char* MQ2Sensor::getStateName() const {
    switch (_state) {
        case MQ2State::BURN_IN: return "burn_in";
        case MQ2State::WARMING_UP: return "warming_up";
        case MQ2State::CALIBRATING: return "calibrating";
        case MQ2State::READY: return "ready";
        case MQ2State::FAULT: return "fault";
    }
    return "fault";
}

bool MQ2Sensor::isReady() const {
    return _state == MQ2State::READY && _hasCalibration && _sampleValid;
}

bool MQ2Sensor::isRawDanger() const {
    return _sampleValid && _adcMillivolts >= MQ2_RAW_ALERT_ADC_MV;
}
