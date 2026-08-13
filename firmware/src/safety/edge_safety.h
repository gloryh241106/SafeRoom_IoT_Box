#ifndef __EDGE_SAFETY_H__
#define __EDGE_SAFETY_H__

#pragma once

#include <Arduino.h>

#include "../actuators/buzzer.h"
#include "../actuators/led.h"
#include "../mqtt/mqtt_client.h"

/*
 * Edge-local safety autonomy (TC-03).
 *
 * Owns the buzzer and red alert LED. The high-priority gas task feeds it the
 * latest MQ2 state and mirrors its active state to the OLED. READY sensors use
 * the calibrated 600 PPM rule and may queue cloud alerts. During burn-in,
 * warm-up, or calibration, a conservative raw ADC voltage rule preserves local
 * protection without publishing fake PPM anomalies or emails.
 *
 * Remote buzzer/alert-LED commands are remembered but suppressed while a
 * breach is active (edge safety wins), and re-applied once gas drops back
 * below the clear threshold.
 */
class EdgeSafety {
public:
    EdgeSafety(Buzzer& buzzer, Led& alertLed, MqttClient& mqtt);

    void update(float gasPpm,
                bool gasReady,
                uint32_t gasAdcMillivolts,
                unsigned long long timestampMs); // call every loop iteration
    void serviceCloudAlert(); // call from the main/network task only
    bool isActive() const;

    void applyRemoteBuzzer(bool on);
    void applyRemoteAlertLed(bool on);

private:
    void trigger();
    void release();
    void liveAlarm();
    void queueCloudAlert();
    bool publishAlert(float gasPpm, unsigned long long timestampMs);

    Buzzer& _buzzer;
    Led& _alertLed;
    MqttClient& _mqtt;

    volatile bool _active = false;
    bool _beepPhase = false;
    bool _remoteBuzzer = false;
    bool _remoteAlertLed = false;
    bool _calibratedAlert = false;
    volatile bool _cloudAlertPending = false;
    volatile uint32_t _cloudAlertGeneration = 0;

    uint32_t _lastBeepToggleMs = 0;
    uint32_t _lastAlertPublishMs = 0;
    float _lastGasPpm = 0.0f;
    uint32_t _lastGasAdcMillivolts = 0;
    unsigned long long _timestampMs = 0ULL;
    float _pendingGasPpm = 0.0f;
    unsigned long long _pendingTimestampMs = 0ULL;
    portMUX_TYPE _stateMux = portMUX_INITIALIZER_UNLOCKED;
};

#endif // __EDGE_SAFETY_H__
