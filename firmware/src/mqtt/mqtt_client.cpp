#include "mqtt_client.h"
#include "../config/config.h"

MqttClient* MqttClient::_instance = nullptr;

void MqttClient::begin(const char* deviceId,
                       const char* brokerHost,
                       uint16_t brokerPort,
                       const char* username,
                       const char* password,
                       const char* caCert) {
    _deviceId = deviceId;
    _brokerHost = brokerHost;
    _brokerPort = brokerPort;
    _username = username;
    _password = password;
    _caCert = caCert;

    _secureClient.setCACert(_caCert.c_str());
    _secureClient.setTimeout(5); // seconds; avoid blocking MQTT ops

    _client.setClient(_secureClient);
    _client.setServer(_brokerHost.c_str(), _brokerPort);
    _client.setKeepAlive(MQTT_KEEPALIVE_S);
    _client.setBufferSize(MQTT_BUFFER_SIZE);
    _client.setCallback(onMessage);

    _instance = this;
}

void MqttClient::loop() {
    _client.loop();
    if (!_client.connected()) connect();
}

bool MqttClient::isConnected() {
    return _client.connected();
}

void MqttClient::connect() {
    if (_client.connected()) return;

    // Exponential backoff: skip reconnecting until the delay elapses.
    uint32_t nowMs = millis();
    if (nowMs - _lastReconnectAttemptMs < _reconnectDelayMs) return;
    _lastReconnectAttemptMs = nowMs;

    DBG("[MQTT] Connecting to %s:%u ...\n", _brokerHost.c_str(), _brokerPort);

    String willTopic = topic("status");
    bool ok = _client.connect(_deviceId.c_str(),
                              _username.c_str(),
                              _password.c_str(),
                              willTopic.c_str(),
                              1,      // LWT QoS 1
                              true,   // LWT retained
                              "{\"status\":\"offline\"}");

    if (ok) {
        _reconnectDelayMs = MQTT_RECONNECT_MIN_MS;
        DBGLN("[MQTT] Connected.");
        publishStatus("{\"status\":\"online\"}");
        _client.subscribe(topic("control").c_str(), 1);
        DBGLN("[MQTT] Subscribed to control topic (QoS 1).");
    } else {
        _reconnectDelayMs = min(_reconnectDelayMs * 2, static_cast<uint32_t>(MQTT_RECONNECT_MAX_MS));
        DBG("[MQTT] Connect failed (state=%d). Next retry in %lu ms.\n",
            _client.state(), _reconnectDelayMs);
    }
}

bool MqttClient::publishTelemetry(const char* payload) {
    if (!_client.connected()) return false;
    return _client.publish(topic("telemetry").c_str(),
                           reinterpret_cast<const uint8_t*>(payload),
                           strlen(payload), false); // QoS 0
}

bool MqttClient::publishStatus(const char* payload) {
    if (!_client.connected()) return false;
    return _client.publish(topic("status").c_str(),
                           reinterpret_cast<const uint8_t*>(payload),
                           strlen(payload), true); // QoS 1, retained
}

bool MqttClient::publishAlert(const char* payload) {
    if (!_client.connected()) return false;
    return _client.publish(topic("alerts").c_str(),
                           reinterpret_cast<const uint8_t*>(payload),
                           strlen(payload), false); // QoS 1, not retained
}

void MqttClient::onControl(ControlCallback callback) {
    _controlCallback = callback;
}

void MqttClient::onMessage(char* topic, byte* payload, unsigned int length) {
    (void)topic;
    if (_instance) _instance->handleMessage(payload, length);
}

void MqttClient::handleMessage(byte* payload, unsigned int length) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    if (error) {
        DBG("[MQTT] Bad control JSON: %s\n", error.c_str());
        return;
    }

    const char* actuator = doc["actuator"] | "";
    bool state = false;
    if (doc["state"].is<bool>()) {
        state = doc["state"].as<bool>();
    } else {
        const char* stateStr = doc["state"] | "off";
        state = (strcmp(stateStr, "on") == 0);
    }

    DBG("[MQTT] Control: actuator='%s' state=%s\n", actuator, state ? "ON" : "OFF");

    if (_controlCallback) _controlCallback(actuator, state);
}

String MqttClient::topic(const char* channel) const {
    return String("safebox/") + _deviceId + "/" + channel;
}