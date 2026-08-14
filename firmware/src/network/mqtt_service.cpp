#include "mqtt_service.h"

#include <ArduinoJson.h>

#include "../config.h"

MqttService* MqttService::_instance = nullptr;

// Creates PubSubClient on top of the secure WiFi transport.
MqttService::MqttService() : _client(_tls) {}

// Stores broker settings and configures TLS, callbacks, and limits.
void MqttService::begin(const char* deviceId, const char* host, uint16_t port,
                        const char* username, const char* password,
                        const char* caCert, ControlHandler controlHandler) {
    _instance = this;
    _deviceId = deviceId;
    _host = host;
    _port = port;
    _username = username;
    _password = password;
    _controlHandler = controlHandler;

    _tls.setCACert(caCert);
    _tls.setTimeout(MQTT_SOCKET_TIMEOUT_SECONDS);
    _client.setServer(_host.c_str(), _port);
    _client.setCallback(mqttCallback);
    _client.setBufferSize(MQTT_BUFFER_SIZE);
    _client.setKeepAlive(MQTT_KEEPALIVE_SECONDS);
    _client.setSocketTimeout(MQTT_SOCKET_TIMEOUT_SECONDS);
}

// Stops MQTT without WiFi, otherwise processes or reconnects the client.
void MqttService::update(bool wifiConnected) {
    if (!wifiConnected) {
        if (_client.connected()) _client.disconnect();
        _tls.stop();
        return;
    }

    if (_client.connected()) _client.loop();
    else connectIfDue();
}

// Exposes broker state without leaking the PubSubClient object.
bool MqttService::connected() {
    return _client.connected();
}

// Publishes telemetry at PubSubClient's supported QoS 0.
bool MqttService::publishTelemetry(const char* payload) {
    return connected()
        && _client.publish(topic("telemetry").c_str(), payload, false);
}

// Publishes alerts on their own topic at QoS 0.
bool MqttService::publishAlert(const char* payload) {
    return connected() && _client.publish(topic("alerts").c_str(), payload, false);
}

// Forwards the static MQTT callback to the active service instance.
void MqttService::mqttCallback(char*, byte* payload, unsigned int length) {
    if (_instance) _instance->handleControl(payload, length);
}

// Accepts a boolean or an "on"/"off" state from the backend.
void MqttService::handleControl(byte* payload, unsigned int length) {
    JsonDocument document;
    if (deserializeJson(document, payload, length)) {
        SAFEBOX_LOG_LN("[MQTT] Ignored invalid control JSON");
        return;
    }

    const char* actuator = document["actuator"] | "";
    bool state = false;
    if (document["state"].is<bool>()) {
        state = document["state"].as<bool>();
    } else {
        state = strcmp(document["state"] | "off", "on") == 0;
    }

    if (_controlHandler) _controlHandler(actuator, state);
}

// Retries at a fixed interval and configures retained online/offline status.
void MqttService::connectIfDue() {
    const uint32_t now = millis();
    if (_lastConnectAttemptMs
        && now - _lastConnectAttemptMs < MQTT_RECONNECT_INTERVAL_MS) return;
    _lastConnectAttemptMs = now;

    const String statusTopic = topic("status");
    const bool connectedNow = _client.connect(
        _deviceId.c_str(), _username.c_str(), _password.c_str(),
        statusTopic.c_str(), 1, true, "{\"status\":\"offline\"}");

    if (!connectedNow) {
        SAFEBOX_LOGF("[MQTT] Connection failed, state=%d\n", _client.state());
        return;
    }

    _client.publish(statusTopic.c_str(), "{\"status\":\"online\"}", true);
    _client.subscribe(topic("control").c_str(), 1);
    SAFEBOX_LOG_LN("[MQTT] Connected");
}

// Builds every MQTT topic with the same device ID.
String MqttService::topic(const char* channel) const {
    return String("safebox/") + _deviceId + "/" + channel;
}
