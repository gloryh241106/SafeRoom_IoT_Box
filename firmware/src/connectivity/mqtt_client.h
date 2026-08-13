#pragma once

#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

class SafeboxMqttClient {
public:
    using ControlCallback = void (*)(const char* actuator, bool state);

    SafeboxMqttClient();
    void begin(const char* deviceId, const char* host, uint16_t port,
               const char* username, const char* password, const char* caCert,
               ControlCallback callback);
    void update(uint32_t nowMs, bool networkConnected);
    bool connected();
    bool publishTelemetry(const char* payload);
    bool publishAlert(const char* payload);

private:
    static void onMessage(char* topic, byte* payload, unsigned int length);
    void handleMessage(byte* payload, unsigned int length);
    void connect(uint32_t nowMs);
    String topic(const char* channel) const;

    WiFiClientSecure _tls;
    PubSubClient _client;
    String _deviceId;
    String _host;
    String _username;
    String _password;
    uint16_t _port = 0;
    uint32_t _lastConnectMs = 0;
    ControlCallback _controlCallback = nullptr;
    static SafeboxMqttClient* _instance;
};
