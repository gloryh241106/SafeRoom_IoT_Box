#include <Arduino.h>
#include <cstring>
#include <time.h>

#include "secrets.h"
#include "actuators/actuators.h"
#include "config.h"
#include "device_state.h"
#include "display/oled.h"
#include "features/gas_safety.h"
#include "features/telemetry.h"
#include "network/mqtt_service.h"
#include "network/wifi_setup.h"
#include "sensors/dht22_sensor.h"
#include "sensors/mq2_sensor.h"
#include "sensors/pir_sensor.h"

// ---------------------------------------------------------------------------
// Shared hardware and network modules used for the device lifetime.
// Pins come from config.h so modules do not hard-code the wiring.
// ---------------------------------------------------------------------------
Dht22Sensor dht22(PIN_DHT22);
Mq2Sensor mq2(PIN_MQ2);
PirSensor pir(PIN_PIR);
Actuators actuators(PIN_FAN_RELAY, PIN_ALERT_LED, PIN_BUZZER,
                    FAN_RELAY_ACTIVE_LOW, BUZZER_ACTIVE_LOW);
OledDisplay oled;
WifiSetup wifi;
MqttService mqtt;
GasSafety gasSafety(mq2, actuators, oled);
Telemetry telemetry(mqtt, DEVICE_ID);
DeviceState deviceState;

// ---------------------------------------------------------------------------
// Main-loop state uses millis() instead of long blocking delays.
// alertPending retains a gas event until MQTT accepts it.
// ---------------------------------------------------------------------------
uint32_t lastTelemetryMs = 0;
uint32_t lastAlertAttemptMs = 0;
uint16_t pendingAlertRaw = 0;
bool alertPending = false;
bool ntpStarted = false;
bool timeReady = false;
uint32_t lastNtpStatusLogMs = 0;
bool gasAlarmObserved = false;
bool previousGasAlarm = false;

/**
 * Starts SNTP after WiFi association and waits for a certificate-safe epoch.
 * Merely calling configTime() is not enough because synchronization is async.
 */
void updateNetworkTime(uint32_t nowMs) {
    if (!wifi.connected()) {
        ntpStarted = false;
        timeReady = false;
        return;
    }

    if (!ntpStarted) {
        configTime(0, 0, "pool.ntp.org", "time.google.com",
                   "time.cloudflare.com");
        ntpStarted = true;
        lastNtpStatusLogMs = nowMs;
        SAFEBOX_LOG_LN("[Time] NTP sync requested; MQTTS paused");
    }

    const time_t currentTime = time(nullptr);
    if (!timeReady
        && currentTime >= static_cast<time_t>(NTP_MIN_VALID_UNIX_TIME)) {
        timeReady = true;
        SAFEBOX_LOGF("[Time] NTP synchronized, epoch=%lld\n",
                     static_cast<long long>(currentTime));
    } else if (!timeReady
               && nowMs - lastNtpStatusLogMs >= NTP_STATUS_LOG_INTERVAL_MS) {
        lastNtpStatusLogMs = nowMs;
        SAFEBOX_LOG_LN("[Time] Waiting for valid NTP time; MQTTS paused");
    }
}

/**
 * Selects OLED content for the current network state.
 * OledDisplay ignores this screen while a gas warning has priority.
 */
void showNetworkStatus() {
    if (wifi.connected()) {
        oled.showStatus("WiFi connected", wifi.ssid(), wifi.ipAddress());
    } else if (wifi.portalActive()) {
        oled.showStatus("Safebox-AP", "PW: 12345678", "192.168.4.1");
    } else {
        oled.showStatus("WiFi offline", "Waiting...", "");
    }
}

/**
 * Applies a command already parsed by MqttService.
 * Only the fan is remotely controllable; the buzzer and alert LED are driven
 * exclusively by the local edge gas alarm. Unknown actuators are ignored.
 */
void handleControl(const char* actuator, bool state) {
    if (strcmp(actuator, "fan") == 0) {
        actuators.setFan(state);
    } else {
        SAFEBOX_LOGF("[Control] Unknown actuator: %s\n", actuator);
        return;
    }

    SAFEBOX_LOGF("[Control] %s=%s\n", actuator, state ? "ON" : "OFF");
}

/**
 * Applies a runtime gas threshold config received over MQTT. The edge safety
 * decision stays local; raising the alarm threshold lets the existing auto-clear
 * logic turn the buzzer/LED/OLED off once the gas drops below the new value.
 */
void handleGasConfig(uint16_t alarmThreshold, uint16_t clearThreshold) {
    gasSafety.updateThresholds(alarmThreshold, clearThreshold);
}

/**
 * Reads sensors and publishes a complete snapshot every two seconds.
 * Invalid DHT22 data is not published as fake zero values.
 */
void readSensorsAndPublish(uint32_t nowMs) {
    if (nowMs - lastTelemetryMs < SENSOR_TELEMETRY_INTERVAL_MS) return;
    lastTelemetryMs = nowMs;

    float temperature = NAN;
    float humidity = NAN;
    deviceState.sensors.dhtValid = dht22.read(temperature, humidity);
    if (deviceState.sensors.dhtValid) {
        deviceState.sensors.temperature = temperature;
        deviceState.sensors.humidity = humidity;
    }

    deviceState.sensors.gasRaw = gasSafety.gasRaw();
    deviceState.sensors.gasAlarmThreshold = gasSafety.alarmThreshold();
    deviceState.sensors.gasValid = gasSafety.stabilized();
    deviceState.sensors.motionDetected = pir.motionDetected();
    deviceState.actuators = actuators.snapshot();

    const bool published = telemetry.publish(deviceState);
    SAFEBOX_LOGF(
        "[Telemetry] temp=%.1f humidity=%.1f gasRaw=%u threshold=%u motion=%s buzzer=%s gasAlarm=%s mqtt=%s publish=%s\n",
        deviceState.sensors.temperature,
        deviceState.sensors.humidity,
        deviceState.sensors.gasRaw,
        deviceState.sensors.gasAlarmThreshold,
        deviceState.sensors.motionDetected ? "ON" : "OFF",
        deviceState.actuators.buzzerActive ? "ON" : "OFF",
        deviceState.actuators.gasAlarmActive ? "ON" : "OFF",
        mqtt.connected() ? "connected" : "offline",
        published ? "ok" : "failed");
}

/**
 * Takes gas events from the safety task and retries MQTT delivery.
 * MQTT failure cannot disable the already active local outputs.
 */
void publishPendingGasAlert(uint32_t nowMs) {
    uint16_t newAlertRaw = 0;
    if (gasSafety.takeNewAlert(newAlertRaw)) {
        pendingAlertRaw = newAlertRaw;
        alertPending = true;
    }

    if (!alertPending) return;
    if (lastAlertAttemptMs
        && nowMs - lastAlertAttemptMs < EDGE_ALERT_RETRY_MS) return;

    lastAlertAttemptMs = nowMs;
    if (telemetry.publishGasAlert(pendingAlertRaw, gasSafety.alarmThreshold())) {
        alertPending = false;
        SAFEBOX_LOG_LN("[Safety] Gas alert published");
    }
}

/**
 * Initializes safe outputs, sensors, local safety, WiFi, and MQTT.
 * Local safety starts before potentially slow network operations.
 */
void setup() {
    Serial.begin(115200);

    // Outputs are initialized first so the active-low relay and buzzer are OFF.
    actuators.begin();
    dht22.begin();
    mq2.begin();
    pir.begin();
    oled.begin(PIN_OLED_SDA, PIN_OLED_SCL, OLED_ADDRESS);

    // Local safety starts before any potentially slow WiFi/TLS operation.
    gasSafety.begin();

    wifi.begin(WIFI_AP_NAME, WIFI_AP_PASSWORD,
               WIFI_CONNECT_TIMEOUT_SECONDS);
    showNetworkStatus();

    mqtt.begin(DEVICE_ID, MQTT_BROKER_HOST, MQTT_BROKER_PORT,
               MQTT_USERNAME, MQTT_PASSWORD, MQTT_CA_CERT,
               handleControl, handleGasConfig);
}

/**
 * Updates OLED state, WiFi, MQTT, alerts, and telemetry.
 * GasSafety is the only module that reads the MQ2 ADC.
 */
void loop() {
    const uint32_t now = millis();

    const bool currentGasAlarm = gasSafety.alarmActive();
    if (!gasAlarmObserved || currentGasAlarm != previousGasAlarm) {
        gasAlarmObserved = true;
        previousGasAlarm = currentGasAlarm;
        if (!currentGasAlarm) showNetworkStatus();
    }

    wifi.update();
    if (wifi.takeConnectionChanged()) {
        showNetworkStatus();
    }

    updateNetworkTime(now);
    mqtt.update(wifi.connected() && timeReady);
    publishPendingGasAlert(now);
    readSensorsAndPublish(now);

    delay(2);
}
