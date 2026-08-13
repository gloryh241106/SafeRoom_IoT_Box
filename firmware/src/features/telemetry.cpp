#include "telemetry.h"
#include <ArduinoJson.h>
#include <time.h>

Telemetry::Telemetry(SafeboxMqttClient& mqtt, DeviceState& state, const char* deviceId)
    : _mqtt(mqtt), _state(state), _deviceId(deviceId) {}

bool Telemetry::publish() {
    JsonDocument doc;
    unsigned long long timestamp = epochMs();
    if (timestamp) doc["timestamp"] = timestamp;
    doc["deviceId"] = _deviceId;

    JsonObject metrics = doc["metrics"].to<JsonObject>();
    metrics["temperature"] = roundf(_state.sensors.temperature * 10.0f) / 10.0f;
    metrics["humidity"] = roundf(_state.sensors.humidity * 10.0f) / 10.0f;
    metrics["gasLevel"] = _state.sensors.gasLevel;
    metrics["gasRaw"] = _state.sensors.gasLevel;
    metrics["gasValid"] = _state.sensors.gasValid;
    metrics["gasUnit"] = "adc_index";
    metrics["motionDetected"] = _state.sensors.motionDetected;

    JsonObject actuators = doc["actuatorStates"].to<JsonObject>();
    actuators["fanOn"] = _state.actuators.fanOn;
    actuators["buzzerActive"] = _state.actuators.buzzerOn;
    actuators["alertLedActive"] = _state.actuators.alertLedOn;

    char payload[512];
    serializeJson(doc, payload, sizeof(payload));
    return _mqtt.publishTelemetry(payload);
}

bool Telemetry::publishEdgeAlert(int gasValue, int threshold) {
    JsonDocument doc;
    doc["type"] = "EDGE_SAFETY_TRIGGER";
    doc["sensorType"] = "gasLevel";
    doc["observedValue"] = gasValue;
    doc["threshold"] = threshold;
    doc["unit"] = "adc_index";
    unsigned long long timestamp = epochMs();
    if (timestamp) doc["timestamp"] = timestamp;

    char payload[256];
    serializeJson(doc, payload, sizeof(payload));
    return _mqtt.publishAlert(payload);
}

unsigned long long Telemetry::epochMs() {
    time_t now = time(nullptr);
    if (now < 1609459200) return 0;
    return static_cast<unsigned long long>(now) * 1000ULL;
}
