#include "telemetry.h"

#include <time.h>

#include "../config.h"

// Stores transport and identity without managing the broker connection.
Telemetry::Telemetry(MqttService& mqtt, const char* deviceId)
    : _mqtt(mqtt), _deviceId(deviceId) {}

// Builds one complete document for one backend snapshot.
bool Telemetry::publish(const DeviceState& state) {
    // DHT22 remains mandatory; gas publishes with gasValid=false until the
    // MQ2 heater warm-up window ends so garbage readings never reach the
    // backend anomaly engine.
    if (!state.sensors.dhtValid) {
        SAFEBOX_LOG_LN("[Telemetry] Waiting for valid DHT22 readings");
        return false;
    }

    JsonDocument document;
    const unsigned long long timestamp = epochMilliseconds();
    if (timestamp) document["timestamp"] = timestamp;
    document["deviceId"] = _deviceId;

    JsonObject metrics = document["metrics"].to<JsonObject>();
    writeSensors(metrics, state.sensors);

    JsonObject actuators = document["actuatorStates"].to<JsonObject>();
    writeFanState(actuators, state.actuators);
    writeBuzzerState(actuators, state.actuators);
    writeAlertLedState(actuators, state.actuators);
    writeGasAlarmState(actuators, state.actuators);

    char payload[512];
    if (measureJson(document) + 1 > sizeof(payload)) return false;
    serializeJson(document, payload, sizeof(payload));
    return _mqtt.publishTelemetry(payload);
}

// Builds an immediate gas alert without waiting for periodic telemetry.
bool Telemetry::publishGasAlert(uint16_t observedRaw, uint16_t thresholdRaw) {
    JsonDocument document;
    document["type"] = "EDGE_SAFETY_TRIGGER";
    document["sensorType"] = "gasLevel";
    document["observedValue"] = observedRaw;
    document["threshold"] = thresholdRaw;
    document["unit"] = "adc_index";

    const unsigned long long timestamp = epochMilliseconds();
    if (timestamp) document["timestamp"] = timestamp;

    char payload[256];
    if (measureJson(document) + 1 > sizeof(payload)) return false;
    serializeJson(document, payload, sizeof(payload));
    return _mqtt.publishAlert(payload);
}

// Keeps gasLevel and gasRaw equal for backend compatibility. Invalid gas is
// published as a zero index so warm-up garbage cannot trigger cloud alerts.
void Telemetry::writeSensors(JsonObject metrics, const SensorState& sensors) {
    const uint16_t gasValue = sensors.gasValid ? sensors.gasRaw : 0;
    metrics["temperature"] = sensors.temperature;
    metrics["humidity"] = sensors.humidity;
    metrics["gasLevel"] = gasValue;
    metrics["gasRaw"] = gasValue;
    metrics["gasValid"] = sensors.gasValid;
    metrics["gasUnit"] = "adc_index";
    metrics["motionDetected"] = sensors.motionDetected;
}

// Writes the fan state separately for easier relay debugging.
void Telemetry::writeFanState(JsonObject actuators, const ActuatorState& state) {
    actuators["fanOn"] = state.fanOn;
}

// Writes the physical buzzer state after safety override.
void Telemetry::writeBuzzerState(JsonObject actuators, const ActuatorState& state) {
    actuators["buzzerActive"] = state.buzzerActive;
}

// Writes the physical red LED state after safety override.
void Telemetry::writeAlertLedState(JsonObject actuators, const ActuatorState& state) {
    actuators["alertLedActive"] = state.alertLedActive;
}

// Writes whether the local MQ2 safety override currently holds buzzer/LED.
void Telemetry::writeGasAlarmState(JsonObject actuators, const ActuatorState& state) {
    actuators["gasAlarmActive"] = state.gasAlarmActive;
}

// Rejects pre-2021 time to avoid a false 1970 timestamp before NTP sync.
unsigned long long Telemetry::epochMilliseconds() {
    const time_t now = time(nullptr);
    if (now < 1609459200) return 0;
    return static_cast<unsigned long long>(now) * 1000ULL;
}
