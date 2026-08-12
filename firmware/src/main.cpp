/*
|--------------------------------------------------------------------------
| SafeRoom IoT Box - ESP32 Firmware Entry Point
|--------------------------------------------------------------------------
| Responsibilities:
|   1. Boot sensors, actuators, OLED, WiFi provisioning, MQTT, and clock sync.
|   2. Pump: WiFi keep-alive -> MQTT -> fast gas poll/edge safety -> 2s
|      telemetry -> OLED render.
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
EdgeSafety edgeSafety(buzzer, alertLed, mqtt, oled);
// =========================
// Runtime State
// =========================
SensorSnapshot snapshot;   // shared with the OLED renderer
uint32_t lastSensorReadMs = 0;
uint32_t lastGasPollMs = 0;

// =========================
// SoftAP Status (WiFiManager callback)
// =========================
static void showApMode() {
    oled.setMode(DisplayMode::AP_MODE);
    oled.update();
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
        edgeSafety.applyRemoteBuzzer(state);   // edge safety may override
    } else if (strcmp(actuator, "alertLed") == 0) {
        edgeSafety.applyRemoteAlertLed(state); // edge safety may override
    }
}

// =========================
// Sensor Sampling & Telemetry
// =========================
static void readAllSensors() {
    dht.read();    // keep last valid readings on transient failure
    pir.read();
    mq2.read();          // also refreshed by the fast poll path

    snapshot.temperature = dht.getTemperature();
    snapshot.humidity = dht.getHumidity();
    snapshot.gasPpm = mq2.getPpm();
    snapshot.motionDetected = pir.isMotionDetected();
    snapshot.fanOn = fanRelay.isOn();
    snapshot.buzzerActive = buzzer.isAlarming();
    snapshot.alertLedActive = alertLed.isOn();
}

static void publishTelemetry() {
    JsonDocument doc;
    if (systemClock.synced()) doc["timestamp"] = systemClock.epochMs();
    doc["deviceId"] = DEVICE_ID;

    JsonObject metrics = doc["metrics"].to<JsonObject>();
    metrics["temperature"] = static_cast<double>(roundf(snapshot.temperature * 10.0f) / 10.0f);
    metrics["humidity"] = static_cast<double>(roundf(snapshot.humidity * 10.0f) / 10.0f);
    metrics["gasLevel"] = static_cast<long>(roundf(snapshot.gasPpm));
    metrics["motionDetected"] = snapshot.motionDetected;

    JsonObject actuatorStates = doc["actuatorStates"].to<JsonObject>();
    actuatorStates["fanOn"] = snapshot.fanOn;
    actuatorStates["buzzerActive"] = snapshot.buzzerActive;
    actuatorStates["alertLedActive"] = snapshot.alertLedActive;

    char buffer[512];
    serializeJson(doc, buffer, sizeof(buffer));
    if (mqtt.publishTelemetry(buffer)) {
        DBGLN("[MQTT] Telemetry published (QoS 0).");
    } else {
        DBGLN("[MQTT] Telemetry dropped: not connected.");
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

    if (!wifi.provision()) {
        DBGLN("[WiFi] Portal timed out without configuration; rebooting.");
        ESP.restart();
    }
    DBG("[WiFi] Connected. IP: %s\n", wifi.ipString().c_str());

    // --- Clock sync (for telemetry timestamps) ---
    systemClock.begin();

    // --- MQTT ---
    mqtt.begin(DEVICE_ID, MQTT_BROKER_HOST, MQTT_BROKER_PORT,
               MQTT_USERNAME, MQTT_PASSWORD, MQTT_CA_CERT);
    mqtt.onControl(onControlMessage);
    mqtt.connect();

    oled.setMode(DisplayMode::CONNECTED);
    oled.setTextInfo(wifi.ipString(), String(DEVICE_ID));
    oled.setSensorSnapshot(snapshot);
    oled.update();

    statusLed.on();
    DBGLN("[Boot] Setup complete.");
}

// =========================
// Main Loop
// =========================
void loop() {
    uint32_t now = millis();

    // --- WiFi keep-alive (only when up; MQTTS handshake is blocking) ---
    if (wifi.isConnected()) {
        mqtt.loop();     // keep-alive + non-blocking reconnect
        systemClock.poll();    // latch NTP sync once the epoch is valid
        statusLed.on();
    } else {
        statusLed.off();
        if (wifi.handleConnectionLoss()) ESP.restart();
    }

    // --- Fast gas poll: < 200 ms edge safety response ---
    if (now - lastGasPollMs >= GAS_POLL_INTERVAL_MS) {
        lastGasPollMs = now;
        mq2.read();
    }
    edgeSafety.update(mq2.getPpm(),
                      systemClock.synced() ? systemClock.epochMs() : 0ULL);

    // --- Periodic full sensor read + telemetry (2 s) ---
    if (now - lastSensorReadMs >= SENSOR_INTERVAL_MS) {
        lastSensorReadMs = now;
        readAllSensors();
        oled.setSensorSnapshot(snapshot);
        publishTelemetry();
    }

    oled.update();
}
