#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

#include "FanController.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

namespace {
constexpr uint8_t FAN_RELAY_PIN = 16;
constexpr unsigned long WIFI_RETRY_MS = 10000;
constexpr unsigned long MQTT_RETRY_MAX_MS = 30000;

WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);
FanController fan(FAN_RELAY_PIN);

String controlTopic;
String statusTopic;
unsigned long nextWifiAttemptAt = 0;
unsigned long nextMqttAttemptAt = 0;
unsigned long mqttRetryMs = 1000;
bool tlsConfigured = false;

void debugLog(const String& message) {
  if (DEBUG_LOGS) Serial.println(message);
}

bool hasPlaceholderConfiguration() {
  return String(WIFI_SSID) == "replace-me" || String(MQTT_HOST) == "your-emqx-host";
}

void configureTls() {
  if (tlsConfigured) return;
  if (MQTT_ALLOW_INSECURE) {
    secureClient.setInsecure();
  } else {
    secureClient.setCACert(MQTT_CA_CERT);
  }
  tlsConfigured = true;
}

void synchronizeClock() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  const unsigned long deadline = millis() + 10000;
  time_t now = time(nullptr);
  while (now < 1700000000 && millis() < deadline) {
    delay(100);
    now = time(nullptr);
  }
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED || millis() < nextWifiAttemptAt) return;
  nextWifiAttemptAt = millis() + WIFI_RETRY_MS;
  debugLog("[WiFi] Connecting...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void mqttCallback(char* topic, uint8_t* payload, unsigned int length) {
  if (controlTopic != topic) return;
  if (fan.handleControlPayload(payload, length)) {
    debugLog(String("[Fan] Relay state: ") + (fan.isOn() ? "ON" : "OFF"));
  } else {
    debugLog("[Fan] Rejected malformed or unsupported control command.");
  }
}

void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected() || millis() < nextMqttAttemptAt) return;

  configureTls();
  synchronizeClock();

  const String clientId = String("safebox_") + DEVICE_ID + "_" + String(ESP.getEfuseMac(), HEX);
  const bool connected = mqttClient.connect(
    clientId.c_str(),
    MQTT_USERNAME,
    MQTT_PASSWORD,
    statusTopic.c_str(),
    1,
    true,
    "{\"status\":\"offline\"}"
  );

  if (connected) {
    mqttRetryMs = 1000;
    mqttClient.subscribe(controlTopic.c_str(), 1);
    mqttClient.publish(statusTopic.c_str(), "{\"status\":\"online\"}", true);
    debugLog("[MQTT] Connected and subscribed to fan control topic.");
    return;
  }

  debugLog(String("[MQTT] Connection failed, state=") + mqttClient.state());
  nextMqttAttemptAt = millis() + mqttRetryMs;
  mqttRetryMs = min(mqttRetryMs * 2, MQTT_RETRY_MAX_MS);
}
}  // namespace

void setup() {
  Serial.begin(115200);
  fan.begin();

  controlTopic = String("safebox/") + DEVICE_ID + "/control";
  statusTopic = String("safebox/") + DEVICE_ID + "/status";
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);

  if (hasPlaceholderConfiguration()) {
    debugLog("[Config] Create firmware/include/secrets.h before flashing.");
    return;
  }
  connectWifi();
}

void loop() {
  if (hasPlaceholderConfiguration()) {
    delay(250);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
    delay(10);
    return;
  }

  connectMqtt();
  if (mqttClient.connected()) mqttClient.loop();
  delay(2);
}
