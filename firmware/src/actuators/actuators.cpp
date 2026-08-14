#include "actuators.h"

#include "../config.h"

// Stores output pins and module polarity settings.
Actuators::Actuators(uint8_t fanPin, uint8_t statusLedPin, uint8_t alertLedPin,
                     uint8_t buzzerPin, bool fanActiveLow, bool buzzerActiveLow)
    : _fanPin(fanPin),
      _statusLedPin(statusLedPin),
      _alertLedPin(alertLedPin),
      _buzzerPin(buzzerPin),
      _fanActiveLow(fanActiveLow),
      _buzzerActiveLow(buzzerActiveLow) {}

// Configures all output pins and applies safe startup states.
void Actuators::begin() {
    // Preload safe levels before enabling output mode to avoid a LOW startup
    // pulse on the active-low relay and buzzer.
    writeOutput(_fanPin, false, _fanActiveLow);
    writeOutput(_statusLedPin, false, false);
    writeOutput(_alertLedPin, false, false);
    writeOutput(_buzzerPin, false, _buzzerActiveLow);

    pinMode(_fanPin, OUTPUT);
    pinMode(_statusLedPin, OUTPUT);
    pinMode(_alertLedPin, OUTPUT);
    pinMode(_buzzerPin, OUTPUT);

    // Apply safe OFF levels immediately. This prevents active-low modules from
    // turning on merely because the ESP32 has just booted.
    portENTER_CRITICAL(&_mux);
    applyLocked();
    writeOutput(_statusLedPin, false, false);
    portEXIT_CRITICAL(&_mux);
}

// Applies the website fan command to the relay.
void Actuators::setFan(bool on) {
    portENTER_CRITICAL(&_mux);
    _fanOn = on;
    applyLocked();
    portEXIT_CRITICAL(&_mux);
}

// Sets the green WiFi status LED.
void Actuators::setStatusLed(bool on) {
    writeOutput(_statusLedPin, on, false);
}

// Enables or clears the local buzzer and red LED override.
void Actuators::setGasAlarm(bool active) {
    portENTER_CRITICAL(&_mux);
    _gasAlarm = active;
    applyLocked();
    portEXIT_CRITICAL(&_mux);
}

// Returns final output states after remote and safety requests are combined.
ActuatorState Actuators::snapshot() const {
    ActuatorState state;
    portENTER_CRITICAL(&_mux);
    state.fanOn = _fanOn;
    state.buzzerActive = _gasAlarm;
    state.alertLedActive = _gasAlarm;
    state.gasAlarmActive = _gasAlarm;
    portEXIT_CRITICAL(&_mux);
    return state;
}

// Maps logical ON/OFF to active-high or active-low GPIO levels.
void Actuators::writeOutput(uint8_t pin, bool on, bool activeLow) {
    digitalWrite(pin, (on != activeLow) ? HIGH : LOW);
}

// Writes all stored states while the caller holds the spinlock.
void Actuators::applyLocked() {
    writeOutput(_fanPin, _fanOn, _fanActiveLow);
    writeOutput(_buzzerPin, _gasAlarm, _buzzerActiveLow);
    writeOutput(_alertLedPin, _gasAlarm, false);
}
