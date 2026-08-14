#pragma once

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>

/** Manages MQTTS, publishes data, and receives actuator commands. */
class MqttService {
public:
    /** Callback used by main.cpp to apply an actuator command. */
    using ControlHandler = void (*)(const char* actuator, bool state);

    /** Attaches PubSubClient to its TLS transport. */
    MqttService();

    /** Stores EMQX settings and configures TLS and callbacks. */
    void begin(const char* deviceId, const char* host, uint16_t port,
               const char* username, const char* password, const char* caCert,
               ControlHandler controlHandler);

    /** Maintains MQTT while WiFi is available. */
    void update(bool wifiConnected);

    /** Reports whether the broker connection is active. */
    bool connected();

    /** Publishes JSON to the device telemetry topic. */
    bool publishTelemetry(const char* payload);

    /** Publishes JSON to the device alert topic. */
    bool publishAlert(const char* payload);

private:
    /** Forwards the static PubSubClient callback to this service. */
    static void mqttCallback(char* topic, byte* payload, unsigned int length);

    /** Parses control JSON and invokes the application callback. */
    void handleControl(byte* payload, unsigned int length);

    /** Retries connection, sets LWT, publishes online, and subscribes. */
    void connectIfDue();

    /** Builds safebox/{deviceId}/{channel}. */
    String topic(const char* channel) const;

    static MqttService* _instance;
    WiFiClientSecure _tls;
    PubSubClient _client;
    String _deviceId;
    String _host;
    String _username;
    String _password;
    uint16_t _port = 8883;
    uint32_t _lastConnectAttemptMs = 0;
    ControlHandler _controlHandler = nullptr;
};
