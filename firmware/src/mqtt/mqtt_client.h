#ifndef __MQTT_CLIENT_H__
#define __MQTT_CLIENT_H__

#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "../config/config.h"

/*
 * MQTTS (TLS, port 8883) client wrapping PubSubClient + WiFiClientSecure.
 *
 * Topics (see README MQTT Topic Registry):
 *   safebox/{deviceId}/telemetry  - publish  (QoS 0)
 *   safebox/{deviceId}/status     - publish  (QoS 1, retained, LWT offline)
 *   safebox/{deviceId}/alerts     - publish  (QoS 1)
 *   safebox/{deviceId}/control    - subscribe (QoS 1)
 *
 * Reconnect uses exponential backoff (MQTT_RECONNECT_MIN_MS -> MAX_MS) and
 * never blocks the main loop; local edge safety keeps running while offline.
 */
class MqttClient {
public:
    using ControlCallback = void (*)(const char* actuator, bool state);

    void begin(const char* deviceId,
               const char* brokerHost,
               uint16_t brokerPort,
               const char* username,
               const char* password,
               const char* caCert);

    void loop();                  // call every main loop iteration
    bool isConnected();
    void connect();               // non-blocking attempt, backoff gated

    bool publishTelemetry(const char* payload); // QoS 0
    bool publishStatus(const char* payload);    // QoS 1, retained
    bool publishAlert(const char* payload);     // QoS 1, non-retained

    void onControl(ControlCallback callback);

private:
    static void onMessage(char* topic, byte* payload, unsigned int length);
    void handleMessage(byte* payload, unsigned int length);
    String topic(const char* channel) const;

    WiFiClientSecure _secureClient;
    PubSubClient _client;

    String _deviceId;
    String _brokerHost;
    uint16_t _brokerPort;
    String _username;
    String _password;
    String _caCert;

    uint32_t _lastReconnectAttemptMs = 0;
    uint32_t _reconnectDelayMs = MQTT_RECONNECT_MIN_MS;
    ControlCallback _controlCallback = nullptr;

    static MqttClient* _instance; // single device instance for static callback
};

#endif // __MQTT_CLIENT_H__