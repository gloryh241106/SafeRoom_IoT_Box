#include "buzzer.h"

namespace {
    constexpr uint8_t BUZZER_LEDC_CHANNEL = 0;
    constexpr uint8_t BUZZER_LEDC_RES_BITS = 12; // 0..4095 duty resolution
    constexpr uint16_t BUZZER_TONE_HZ = 2000;
}

Buzzer::Buzzer(uint8_t pin) : _pin(pin), _active(false) {}

void Buzzer::begin() {
    // ESP32 Arduino core 2.x LEDC API (works on core 3.x via compatibility).
    ledcSetup(BUZZER_LEDC_CHANNEL, BUZZER_TONE_HZ, BUZZER_LEDC_RES_BITS);
    ledcAttachPin(_pin, BUZZER_LEDC_CHANNEL);
    alarmOff();
}

void Buzzer::alarmOn() {
    ledcWriteTone(BUZZER_LEDC_CHANNEL, BUZZER_TONE_HZ);
    _active = true;
}

void Buzzer::alarmOff() {
    ledcWrite(BUZZER_LEDC_CHANNEL, 0);
    _active = false;
}

bool Buzzer::isAlarming() const {
    return _active;
}
