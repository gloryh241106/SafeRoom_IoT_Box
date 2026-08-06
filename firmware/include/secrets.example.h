#pragma once

// Copy this file to secrets.h and replace every placeholder. secrets.h is ignored by Git.
#define WIFI_SSID "replace-me"
#define WIFI_PASSWORD "replace-me"

#define DEVICE_ID "safebox-01"
#define MQTT_HOST "your-emqx-host"
#define MQTT_PORT 8883
#define MQTT_USERNAME "replace-me"
#define MQTT_PASSWORD "replace-me"

// Keep false in production. Paste the broker CA certificate below.
#define MQTT_ALLOW_INSECURE false
static const char MQTT_CA_CERT[] = R"CERT(
-----BEGIN CERTIFICATE-----
replace-with-emqx-ca-certificate
-----END CERTIFICATE-----
)CERT";

#define DEBUG_LOGS true
