#ifndef __EDGE_SAFETY_H__
#define __EDGE_SAFETY_H__

#pragma once

#include <Arduino.h>

#include "../actuators/buzzer.h"
#include "../actuators/led.h"
#include "../display/oled_display.h"
#include "../mqtt/mqtt_client.h"

/*
 * Edge-local safety autonomy (TC-03).
 *
 * Owns the buzzer, the red alert LED, and the OLED warning screen. The main
 * loop feeds it the latest gas reading; when gasLevel > 600 PPM it arms the
 * buzzer/alert LED/OLED locally in < 200 ms without waiting for the cloud, and
 * re-publishes edge alerts to safebox/{deviceId}/alerts while the breach lasts.
 *
 * Remote buzzer/alert-LED commands are remembered but suppressed while a
 * breach is active (edge safety wins), and re-applied once gas drops back
 * below the clear threshold.
 */
class EdgeSafety {
public:
    EdgeSafety(Buzzer& buzzer, Led& alertLed, MqttClient& mqtt, OledDisplay& oled);

    void update(float gasPpm, unsigned long long timestampMs); // call every loop iteration
    bool isActive() const;

    void applyRemoteBuzzer(bool on);
    void applyRemoteAlertLed(bool on);

private:
    void trigger();
    void release();
    void liveAlarm();
    void publishAlert();

    Buzzer& _buzzer;
    Led& _alertLed;
    MqttClient& _mqtt;
    OledDisplay& _oled;

    bool _active = false;
    bool _beepPhase = false;
    bool _remoteBuzzer = false;
    bool _remoteAlertLed = false;

    uint32_t _lastBeepToggleMs = 0;
    uint32_t _lastAlertPublishMs = 0;
    float _lastGasPpm = 0.0f;
    unsigned long long _timestampMs = 0ULL;
};

#endif // __EDGE_SAFETY_H__