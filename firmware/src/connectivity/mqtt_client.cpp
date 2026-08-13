#include "mqtt_client.h"
#include <ArduinoJson.h>
#include "../config/settings.h"

SafeboxMqttClient* SafeboxMqttClient::_instance = nullptr;

SafeboxMqttClient::SafeboxMqttClient() : _client(_tls) {}

void SafeboxMqttClient::begin(const char* deviceId, const char* host, uint16_t port,
                              const char* username, const char* password, const char* caCert,
                              ControlCallback callback) {
    _deviceId = deviceId;
    _host = host;
    _port = port;
    _username = username;
    _password = password;
    _controlCallback = callback;
    _instance = this;

    _tls.setCACert(caCert);
    _tls.setTimeout(5);
    _client.setServer(_host.c_str(), _port);
    _client.setKeepAlive(MQTT_KEEPALIVE_S);
    _client.setBufferSize(MQTT_BUFFER_SIZE);
    _client.setCallback(onMessage);
}

void SafeboxMqttClient::update(uint32_t nowMs, bool networkConnected) {
    if (!networkConnected) return;
    if (_client.connected()) _client.loop();
    else connect(nowMs);
}

bool SafeboxMqttClient::connected() {
    return _client.connected();
}

bool SafeboxMqttClient::publishTelemetry(const char* payload) {
    return connected() && _client.publish(topic("telemetry").c_str(), payload, false);
}

bool SafeboxMqttClient::publishAlert(const char* payload) {
    return connected() && _client.publish(topic("alerts").c_str(), payload, false);
}

void SafeboxMqttClient::connect(uint32_t nowMs) {
    if (_lastConnectMs && nowMs - _lastConnectMs < MQTT_RECONNECT_MS) return;
    _lastConnectMs = nowMs;

    String statusTopic = topic("status");
    bool ok = _client.connect(_deviceId.c_str(), _username.c_str(), _password.c_str(),
                              statusTopic.c_str(), 1, true,
                              "{\"status\":\"offline\"}");
    if (!ok) {
        DBG("[MQTT] Connection failed: %d\n", _client.state());
        return;
    }

    _client.publish(statusTopic.c_str(), "{\"status\":\"online\"}", true);
    _client.subscribe(topic("control").c_str(), 1);
    DBGLN("[MQTT] Connected");
}

void SafeboxMqttClient::onMessage(char*, byte* payload, unsigned int length) {
    if (_instance) _instance->handleMessage(payload, length);
}

void SafeboxMqttClient::handleMessage(byte* payload, unsigned int length) {
    JsonDocument doc;
    if (deserializeJson(doc, payload, length)) return;

    const char* actuator = doc["actuator"] | "";
    bool state = doc["state"].is<bool>()
        ? doc["state"].as<bool>()
        : strcmp(doc["state"] | "off", "on") == 0;
    if (_controlCallback) _controlCallback(actuator, state);
}

String SafeboxMqttClient::topic(const char* channel) const {
    return String("safebox/") + _deviceId + "/" + channel;
}
