/*
|--------------------------------------------------------------------------
| SafeRoom IoT Box - ESP32 Firmware Entry Point
|--------------------------------------------------------------------------
| Responsibilities:
|   1. Boot sensors, actuators, OLED, WiFi provisioning, MQTT, and clock sync.
|   2. Run gas/edge safety in an independent high-priority FreeRTOS task;
|      the Arduino loop owns WiFi, MQTT, 2s telemetry, and OLED rendering.
|
| Modules (see each header for details):
|   - wifi/    WiFiManager provisioning (SoftAP `Safebox-AP` + captive portal)
|   - mqtt/    MQTTS client (telemetry, status, alerts, control)
|   - safety/  edge-local gas safety autonomy (< 200 ms, offline-capable)
|   - utils/   NTP-backed clock for timestamps
|   - sensors/ DHT22, PIR (interrupt latch), MQ2
|   - actuators/ Fan relay, LEDs, active buzzer module (digital ON/OFF)
|   - display/ SSD1306 OLED
|
| Architecture directives (see AGENTS.md):
|   - Fan control is REMOTE-only (no local auto-trigger).
|   - Edge safety never waits for backend/network responses.
|--------------------------------------------------------------------------
*/

#include <Arduino.h>
#include <ArduinoJson.h>

#include "secrets.h"
#include "config/config.h"
#include "config/pins.h"
#include "sensors/dht_sensor.h"
#include "sensors/pir_sensor.h"
#include "sensors/mq2_sensor.h"
#include "actuators/relay.h"
#include "actuators/led.h"
#include "actuators/buzzer.h"
#include "display/oled_display.h"
#include "utils/time_utils.h"
#include "wifi/wifi_manager.h"
#include "mqtt/mqtt_client.h"
#include "safety/edge_safety.h"

// =========================
// Hardware Instances
// =========================
DHTSensor dht(DHT22_PIN);
PIRSensor pir(PIR_PIN);
MQ2Sensor mq2(MQ2_PIN);

Relay fanRelay(FAN_RELAY_PIN);
Led statusLed(STATUS_LED_PIN);
Led alertLed(ALERT_LED_PIN);
Buzzer buzzer(BUZZER_PIN, BUZZER_ACTIVE_LOW != 0);

OledDisplay oled;
MqttClient mqtt;
SafeboxWifi wifi;
SystemClock systemClock;
EdgeSafety edgeSafety(buzzer, alertLed, mqtt);
// =========================
// Runtime State
// =========================
SensorSnapshot snapshot;   // shared with the OLED renderer
uint32_t lastSensorReadMs = 0;
bool mqttStarted = false;
SemaphoreHandle_t gasMutex = nullptr;
SemaphoreHandle_t edgeMutex = nullptr;
SemaphoreHandle_t oledMutex = nullptr;

// =========================
// SoftAP Status (WiFiManager callback)
// =========================
static void showApMode() {
    if (oledMutex && xSemaphoreTake(oledMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        oled.setMode(DisplayMode::AP_MODE);
        oled.update();
        xSemaphoreGive(oledMutex);
    }
}

// =========================
// Remote Actuator Control (Backend -> ESP32)
// =========================
static void onControlMessage(const char* actuator, bool state) {
    if (strcmp(actuator, "fan") == 0) {
        if (state) fanRelay.on();
        else fanRelay.off();
        DBG("[Fan] Relay state: %s\n", fanRelay.isOn() ? "ON" : "OFF");
    } else if (strcmp(actuator, "buzzer") == 0) {
        if (xSemaphoreTake(edgeMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
            edgeSafety.applyRemoteBuzzer(state); // edge safety may override
            xSemaphoreGive(edgeMutex);
        }
    } else if (strcmp(actuator, "alertLed") == 0) {
        if (xSemaphoreTake(edgeMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
            edgeSafety.applyRemoteAlertLed(state); // edge safety may override
            xSemaphoreGive(edgeMutex);
        }
    }
}

// =========================
// Sensor Sampling & Telemetry
// =========================
static void readAllSensors() {
    dht.read();    // keep last valid readings on transient failure
    pir.read();

    bool buzzerActive = false;
    bool alertLedActive = false;
    if (xSemaphoreTake(edgeMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        buzzerActive = buzzer.isAlarming();
        alertLedActive = alertLed.isOn();
        xSemaphoreGive(edgeMutex);
    }

    if (xSemaphoreTake(gasMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        snapshot.temperature = dht.getTemperature();
        snapshot.humidity = dht.getHumidity();
        snapshot.motionDetected = pir.isMotionDetected();
        snapshot.fanOn = fanRelay.isOn();
        snapshot.buzzerActive = buzzerActive;
        snapshot.alertLedActive = alertLedActive;
        xSemaphoreGive(gasMutex);
    }
}

static void publishTelemetry() {
    SensorSnapshot telemetrySnapshot;
    float gasRaw = 0.0f;
    float gasSourceMillivolts = 0.0f;
    float gasRo = 0.0f;
    float gasRatio = 0.0f;
    uint32_t gasBurnInRemainingSeconds = 0;
    const char* gasState = "fault";

    if (xSemaphoreTake(gasMutex, pdMS_TO_TICKS(20)) != pdTRUE) {
        DBGLN("[MQTT] Telemetry deferred: MQ2 snapshot busy.");
        return;
    }
    telemetrySnapshot = snapshot;
    gasRaw = mq2.getRaw();
    gasSourceMillivolts = mq2.getSourceMillivolts();
    gasRo = mq2.getRo();
    gasRatio = mq2.getResistanceRatio();
    gasBurnInRemainingSeconds = mq2.getBurnInRemainingSeconds();
    gasState = mq2.getStateName();
    xSemaphoreGive(gasMutex);

    JsonDocument doc;
    if (systemClock.synced()) doc["timestamp"] = systemClock.epochMs();
    doc["deviceId"] = DEVICE_ID;

    JsonObject metrics = doc["metrics"].to<JsonObject>();
    metrics["temperature"] = static_cast<double>(roundf(telemetrySnapshot.temperature * 10.0f) / 10.0f);
    metrics["humidity"] = static_cast<double>(roundf(telemetrySnapshot.humidity * 10.0f) / 10.0f);
    if (telemetrySnapshot.gasReady) {
        metrics["gasLevel"] = static_cast<long>(roundf(telemetrySnapshot.gasPpm));
    } else {
        metrics["gasLevel"] = nullptr;
    }
    metrics["motionDetected"] = telemetrySnapshot.motionDetected;

    JsonObject gasSensor = doc["sensorStatus"]["gas"].to<JsonObject>();
    gasSensor["state"] = gasState;
    gasSensor["ready"] = telemetrySnapshot.gasReady;
    gasSensor["adcRaw"] = static_cast<long>(roundf(gasRaw));
    gasSensor["adcMillivolts"] = telemetrySnapshot.gasAdcMillivolts;
    gasSensor["sourceMillivolts"] = static_cast<long>(roundf(gasSourceMillivolts));
    gasSensor["burnInRemainingSeconds"] = gasBurnInRemainingSeconds;
    if (telemetrySnapshot.gasReady) {
        gasSensor["roOhms"] = static_cast<double>(gasRo);
        gasSensor["rsRoRatio"] = static_cast<double>(gasRatio);
    }

    JsonObject actuatorStates = doc["actuatorStates"].to<JsonObject>();
    actuatorStates["fanOn"] = telemetrySnapshot.fanOn;
    actuatorStates["buzzerActive"] = telemetrySnapshot.buzzerActive;
    actuatorStates["alertLedActive"] = telemetrySnapshot.alertLedActive;

    char buffer[768];
    const size_t requiredBytes = measureJson(doc) + 1;
    if (requiredBytes > sizeof(buffer)) {
        DBG("[MQTT] Telemetry dropped: JSON requires %u bytes.\n",
            static_cast<unsigned int>(requiredBytes));
        return;
    }
    serializeJson(doc, buffer, sizeof(buffer));
    if (mqtt.publishTelemetry(buffer)) {
        DBGLN("[MQTT] Telemetry published (QoS 0).");
    } else {
        DBGLN("[MQTT] Telemetry dropped: not connected.");
    }
}

static void gasSafetyTask(void* parameter) {
    (void)parameter;
    TickType_t lastWakeTick = xTaskGetTickCount();

    for (;;) {
        bool edgeActive = false;
        if (xSemaphoreTake(gasMutex, portMAX_DELAY) == pdTRUE) {
            mq2.read();
            snapshot.gasPpm = mq2.getPpm();
            snapshot.gasAdcMillivolts = mq2.getAdcMillivolts();
            snapshot.gasReady = mq2.isReady();
            if (xSemaphoreTake(edgeMutex, portMAX_DELAY) == pdTRUE) {
                edgeSafety.update(
                    snapshot.gasPpm,
                    snapshot.gasReady,
                    snapshot.gasAdcMillivolts,
                    0ULL
                );
                edgeActive = edgeSafety.isActive();
                xSemaphoreGive(edgeMutex);
            }
            SensorSnapshot displaySnapshot = snapshot;
            xSemaphoreGive(gasMutex);

            if (xSemaphoreTake(oledMutex, portMAX_DELAY) == pdTRUE) {
                oled.setSensorSnapshot(displaySnapshot);
                oled.setWarningActive(edgeActive);
                oled.update();
                xSemaphoreGive(oledMutex);
            }
        }
        vTaskDelayUntil(&lastWakeTick, pdMS_TO_TICKS(GAS_POLL_INTERVAL_MS));
    }
}

// =========================
// Setup
// =========================
void setup() {
    Serial.begin(115200);
    delay(200);

    DBGLN("================================");
    DBGLN(" SafeRoom IoT Box");
    DBGLN(" ESP32 Firmware v1.0");
    DBGLN("================================");

    // --- Sensors ---
    dht.begin();
    pir.begin();
    mq2.begin();
    gasMutex = xSemaphoreCreateMutex();
    edgeMutex = xSemaphoreCreateMutex();
    oledMutex = xSemaphoreCreateMutex();
    if (gasMutex == nullptr || edgeMutex == nullptr || oledMutex == nullptr) {
        DBGLN("[Boot] FATAL: could not create safety synchronization locks.");
        ESP.restart();
    }

    // --- Actuators (fan relay boots open = off; HL-52S is active-low) ---
    fanRelay.begin();
    statusLed.begin();
    alertLed.begin();
    buzzer.begin();

    // --- OLED ---
    oled.begin(OLED_SDA_PIN, OLED_SCL_PIN);
    oled.setMode(DisplayMode::BOOT);
    oled.setSensorSnapshot(snapshot);
    oled.update();

    // --- WiFiManager provisioning ---
    wifi.begin(WIFI_AP_NAME, showApMode,
               WIFI_CONNECT_TIMEOUT_S,
               WIFI_PORTAL_TIMEOUT_S,
               WIFI_LOST_FALLBACK_MS);

    DBGLN("[WiFi] Trying saved credentials...");
    oled.setMode(DisplayMode::CONNECTING);
    oled.setTextInfo("WiFiManager", String(WIFI_AP_NAME));
    oled.update();

    if (wifi.provision()) {
        DBG("[WiFi] Connected. IP: %s\n", wifi.ipString().c_str());
    } else {
        DBGLN("[WiFi] Saved credential connection started asynchronously.");
    }

    // --- Clock sync (for telemetry timestamps) ---
    systemClock.begin();

    // --- MQTT configuration; network connection starts from loop() ---
    mqtt.begin(DEVICE_ID, MQTT_BROKER_HOST, MQTT_BROKER_PORT,
               MQTT_USERNAME, MQTT_PASSWORD, MQTT_CA_CERT);
    mqtt.onControl(onControlMessage);
    if (wifi.isConnected()) {
        mqttStarted = true;
        oled.setMode(DisplayMode::CONNECTED);
        oled.setTextInfo(wifi.ipString(), String(DEVICE_ID));
    }
    oled.setSensorSnapshot(snapshot);
    oled.update();

    BaseType_t taskCreated = xTaskCreatePinnedToCore(
        gasSafetyTask,
        "gas-safety",
        4096,
        nullptr,
        3,
        nullptr,
        ARDUINO_RUNNING_CORE
    );
    if (taskCreated != pdPASS) {
        DBGLN("[Boot] FATAL: could not start MQ2 safety task.");
        ESP.restart();
    }

    if (wifi.isConnected()) statusLed.on();
    DBGLN("[Boot] Setup complete.");
}

// =========================
// Main Loop
// =========================
void loop() {
    uint32_t now = millis();

    // Network/TLS may block this task; gas safety runs independently above it.
    wifi.process();
    if (wifi.isConnected()) {
        if (!mqttStarted) mqttStarted = true;
        mqtt.loop();
        edgeSafety.serviceCloudAlert();
        systemClock.poll();
        statusLed.on();
    } else {
        statusLed.off();
    }

    // --- Periodic full sensor read + telemetry (2 s) ---
    if (now - lastSensorReadMs >= SENSOR_INTERVAL_MS) {
        lastSensorReadMs = now;
        readAllSensors();
        publishTelemetry();
    }

    SensorSnapshot displaySnapshot;
    if (xSemaphoreTake(gasMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        displaySnapshot = snapshot;
        xSemaphoreGive(gasMutex);
    }
    if (xSemaphoreTake(oledMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        oled.setSensorSnapshot(displaySnapshot);
        if (!edgeSafety.isActive()) {
            if (wifi.isConnected()) {
                oled.setMode(DisplayMode::CONNECTED);
                oled.setTextInfo(wifi.ipString(), String(DEVICE_ID));
            } else if (wifi.isPortalActive()) {
                oled.setMode(DisplayMode::AP_MODE);
            } else {
                oled.setMode(DisplayMode::CONNECTING);
                oled.setTextInfo("WiFiManager", String(WIFI_AP_NAME));
            }
        }
        oled.update();
        xSemaphoreGive(oledMutex);
    }
}
