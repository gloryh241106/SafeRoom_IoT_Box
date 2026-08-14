#include "gas_safety.h"

#include "../config.h"

namespace {
#if CONFIG_FREERTOS_UNICORE
constexpr BaseType_t GAS_TASK_CORE = 0;
#else
constexpr BaseType_t GAS_TASK_CORE = 1;
#endif
constexpr UBaseType_t GAS_TASK_PRIORITY = 4;
constexpr uint32_t GAS_TASK_STACK_BYTES = 4096;
}  // namespace

// Stores shared module references without owning them.
GasSafety::GasSafety(Mq2Sensor& sensor, Actuators& actuators, OledDisplay& oled)
    : _sensor(sensor),
      _actuators(actuators),
      _oled(oled),
      _alarmThreshold(GAS_ALARM_THRESHOLD_RAW),
      _clearThreshold(GAS_CLEAR_THRESHOLD_RAW) {}

// Applies a runtime threshold config from the backend. The edge decision stays
// fully local; only the numbers change. Invalid ranges are ignored.
void GasSafety::updateThresholds(uint16_t alarmThreshold, uint16_t clearThreshold) {
    if (alarmThreshold < 1 || clearThreshold > alarmThreshold) {
        SAFEBOX_LOGF("[Safety] Ignored invalid threshold config alarm=%u clear=%u\n",
                     alarmThreshold, clearThreshold);
        return;
    }
    portENTER_CRITICAL(&_mux);
    _alarmThreshold = alarmThreshold;
    _clearThreshold = clearThreshold;
    portEXIT_CRITICAL(&_mux);
    SAFEBOX_LOGF("[Safety] Gas thresholds updated: alarm=%u clear=%u\n",
                 alarmThreshold, clearThreshold);
}

// Returns the alarm threshold currently in force (used for alert payloads).
uint16_t GasSafety::alarmThreshold() const {
    portENTER_CRITICAL(&_mux);
    const uint16_t value = _alarmThreshold;
    portEXIT_CRITICAL(&_mux);
    return value;
}

// Starts the safety task and forces the alarm on if creation fails.
bool GasSafety::begin() {
    _startedAtMs = millis();
    const BaseType_t result = xTaskCreatePinnedToCore(
        taskEntry, "gas-safety", GAS_TASK_STACK_BYTES, this,
        GAS_TASK_PRIORITY, &_taskHandle, GAS_TASK_CORE);

    if (result != pdPASS) {
        _actuators.setGasAlarm(true);
        SAFEBOX_LOG_LN("[Safety] Cannot start gas task; alarm forced ON");
        return false;
    }

    SAFEBOX_LOG_LN("[Safety] Gas task started");
    return true;
}

// Reads the ADC mailbox inside a critical section.
uint16_t GasSafety::gasRaw() const {
    portENTER_CRITICAL(&_mux);
    const uint16_t value = _gasRaw;
    portEXIT_CRITICAL(&_mux);
    return value;
}

// Distinguishes the initial zero from a real zero sample.
bool GasSafety::sampled() const {
    portENTER_CRITICAL(&_mux);
    const bool hasSample = _sampled;
    portEXIT_CRITICAL(&_mux);
    return hasSample;
}

// Reports whether the MQ2 heater has settled and readings can be trusted.
bool GasSafety::stabilized() const {
    portENTER_CRITICAL(&_mux);
    const bool ready = _sampled
        && (millis() - _startedAtMs) >= GAS_STARTUP_STABILIZE_MS;
    portEXIT_CRITICAL(&_mux);
    return ready;
}

// Reports whether the local gas alarm is active.
bool GasSafety::alarmActive() const {
    portENTER_CRITICAL(&_mux);
    const bool active = _alarm;
    portEXIT_CRITICAL(&_mux);
    return active;
}

// Transfers one new alarm event from the task to the main loop.
bool GasSafety::takeNewAlert(uint16_t& observedRaw) {
    portENTER_CRITICAL(&_mux);
    const bool available = _newAlert;
    if (available) {
        observedRaw = _alertRaw;
        _newAlert = false;
    }
    portEXIT_CRITICAL(&_mux);
    return available;
}

// Adapts the FreeRTOS function pointer to this GasSafety object.
void GasSafety::taskEntry(void* context) {
    static_cast<GasSafety*>(context)->run();
}

// Keeps a stable sampling period with vTaskDelayUntil.
void GasSafety::run() {
    TickType_t lastWake = xTaskGetTickCount();
    const TickType_t interval = pdMS_TO_TICKS(GAS_SAMPLE_INTERVAL_MS);
    for (;;) {
        sampleOnce();
        vTaskDelayUntil(&lastWake, interval);
    }
}

// Runs one sample, decision, output, and notification cycle.
void GasSafety::sampleOnce() {
    const uint16_t raw = _sensor.readRaw();

    portENTER_CRITICAL(&_mux);
    const bool oldAlarm = _alarm;
    _gasRaw = raw;
    _sampled = true;

    // Read the runtime thresholds once so a mid-cycle config change cannot
    // produce a mixed alarm/clear comparison.
    const uint16_t alarmThreshold = _alarmThreshold;
    const uint16_t clearThreshold = _clearThreshold;

    // Suppress alarm decisions while the cold MQ2 heater settles after boot.
    // Normal gas confirmation begins only after this window has elapsed.
    if (millis() - _startedAtMs < GAS_STARTUP_STABILIZE_MS) {
        _highSamples = 0;
        _clearSamples = 0;
        _subAlarmSamples = 0;
        portEXIT_CRITICAL(&_mux);
        return;
    }

    if (!_alarm) {
        _clearSamples = 0;
        _subAlarmSamples = 0;
        _highSamples = raw > alarmThreshold
            ? static_cast<uint8_t>(_highSamples + 1)
            : 0;

        if (_highSamples >= GAS_CONFIRM_SAMPLES) {
            _alarm = true;
            _alertRaw = raw;
            _newAlert = true;
            _highSamples = 0;
        }
    } else {
        _highSamples = 0;
        _clearSamples = raw < clearThreshold
            ? static_cast<uint8_t>(_clearSamples + 1)
            : 0;
        _subAlarmSamples = raw < alarmThreshold
            ? static_cast<uint8_t>(_subAlarmSamples + 1)
            : 0;

        if (_clearSamples >= GAS_CONFIRM_SAMPLES
            || _subAlarmSamples >= GAS_AUTO_CLEAR_SAMPLES) {
            _alarm = false;
            _clearSamples = 0;
            _subAlarmSamples = 0;
        }
    }
    const bool newAlarm = _alarm;
    portEXIT_CRITICAL(&_mux);

    if (newAlarm == oldAlarm) return;

    // Physical outputs are applied before display/cloud work.
    _actuators.setGasAlarm(newAlarm);
    if (newAlarm) {
        _oled.showGasWarning(raw, alarmThreshold);
        SAFEBOX_LOGF("[Safety] GAS ALARM raw=%u threshold=%u\n", raw, alarmThreshold);
    } else {
        _oled.clearGasWarning();
        SAFEBOX_LOGF("[Safety] Gas cleared raw=%u\n", raw);
    }
}
