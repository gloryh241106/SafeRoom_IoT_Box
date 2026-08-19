#include "mqtt_service.h"

#include <ArduinoJson.h>

#include "../config.h"

MqttService* MqttService::_instance = nullptr;

// Creates PubSubClient on top of the secure WiFi transport.
MqttService::MqttService() : _client(_tls) {}

// Stores broker settings and configures TLS, callbacks, and limits.
void MqttService::begin(const char* deviceId, const char* host, uint16_t port,
                        const char* username, const char* password,
                        const char* caCert, ControlHandler controlHandler,
                        ConfigHandler configHandler) {
    _instance = this;
    _deviceId = deviceId;
    _host = host;
    _port = port;
    _username = username;
    _password = password;
    _controlHandler = controlHandler;
    _configHandler = configHandler;

    _tls.setCACert(caCert);
    _tls.setTimeout(MQTT_SOCKET_TIMEOUT_SECONDS);
    _client.setServer(_host.c_str(), _port);
    _client.setCallback(mqttCallback);
    _client.setBufferSize(MQTT_BUFFER_SIZE);
    _client.setKeepAlive(MQTT_KEEPALIVE_SECONDS);
    _client.setSocketTimeout(MQTT_SOCKET_TIMEOUT_SECONDS);
}

// Stops MQTT without WiFi, otherwise processes or reconnects the client.
void MqttService::update(bool networkReady) {
    if (!networkReady) {
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

// Forwards the static MQTT callback to the active service instance, routing
// retained config messages to the threshold handler and everything else to
// the actuator handler.
void MqttService::mqttCallback(char* topic, byte* payload, unsigned int length) {
    if (!_instance) return;
    if (topic && strstr(topic, "/config") != nullptr) {
        _instance->handleConfig(payload, length);
    } else {
        _instance->handleControl(payload, length);
    }
}

// Study map (CB-03): decode the wire format, then delegate through a callback.
// The network layer never writes GPIO and unknown actuators remain main.cpp's concern.
// Accepts a boolean or an "on"/"off" state from the backend.
void MqttService::handleControl(byte* payload, unsigned int length) {
    // ArduinoJson parses directly from the MQTT byte buffer and explicit length.
    JsonDocument document;
    // Malformed JSON is logged and stopped before any callback or GPIO path.
    if (deserializeJson(document, payload, length)) {
        SAFEBOX_LOG_LN("[MQTT] Ignored invalid control JSON");
        return;
    }

    // Missing actuator becomes an empty string and will fail main.cpp's allow-list.
    const char* actuator = document["actuator"] | "";
    // Default OFF is the fail-safe for absent or unrecognized state text.
    bool state = false;
    if (document["state"].is<bool>()) {
        // Boolean support keeps firmware compatible with direct/manual publishers.
        state = document["state"].as<bool>();
    } else {
        // The backend's normal wire contract is the readable string "on"/"off".
        state = strcmp(document["state"] | "off", "on") == 0;
    }

    // Delegate policy to main.cpp; this network module does not know output pins.
    if (_controlHandler) _controlHandler(actuator, state);
}

// Applies a runtime gas threshold config pushed by the backend.
void MqttService::handleConfig(byte* payload, unsigned int length) {
    JsonDocument document;
    if (deserializeJson(document, payload, length)) {
        SAFEBOX_LOG_LN("[MQTT] Ignored invalid config JSON");
        return;
    }

    const uint16_t alarm = document["gasAlarmThreshold"] | 0;
    const uint16_t clear = document["gasClearThreshold"] | 0;
    if (alarm < 1 || clear > alarm) {
        SAFEBOX_LOGF("[MQTT] Ignored invalid threshold config alarm=%u clear=%u\n",
                     alarm, clear);
        return;
    }

    if (_configHandler) _configHandler(alarm, clear);
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
        char tlsError[160] = {};
        const int tlsErrorCode = _tls.lastError(tlsError, sizeof(tlsError));
        SAFEBOX_LOGF("[MQTT] Connection failed, state=%d, TLS=%d (%s)\n",
                     _client.state(), tlsErrorCode, tlsError);
        return;
    }

    _client.publish(statusTopic.c_str(), "{\"status\":\"online\"}", true);
    _client.subscribe(topic("control").c_str(), 1);
    _client.subscribe(topic("config").c_str(), 1);
    SAFEBOX_LOGF("[MQTT] Connected, subscribed to control + config (%s)\n",
                 topic("config").c_str());
}

// Builds every MQTT topic with the same device ID.
String MqttService::topic(const char* channel) const {
    return String("safebox/") + _deviceId + "/" + channel;
}
