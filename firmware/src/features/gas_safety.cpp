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
    : _sensor(sensor), _actuators(actuators), _oled(oled) {}

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
        _highSamples = raw > GAS_ALARM_THRESHOLD_RAW
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
        _clearSamples = raw < GAS_CLEAR_THRESHOLD_RAW
            ? static_cast<uint8_t>(_clearSamples + 1)
            : 0;
        _subAlarmSamples = raw < GAS_ALARM_THRESHOLD_RAW
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
        _oled.showGasWarning(raw, GAS_ALARM_THRESHOLD_RAW);
        SAFEBOX_LOGF("[Safety] GAS ALARM raw=%u\n", raw);
    } else {
        _oled.clearGasWarning();
        SAFEBOX_LOGF("[Safety] Gas cleared raw=%u\n", raw);
    }
}
