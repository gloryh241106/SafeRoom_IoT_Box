/*
|--------------------------------------------------------------------------
| SafeRoom IoT Box - Firmware Secrets Template
|--------------------------------------------------------------------------
| Copy this file to `firmware/include/secrets.h` and fill in your values.
| `secrets.h` is ignored by git - never commit real credentials.
|
|   1. WiFi credentials are provisioned at runtime via the WiFiManager
|      captive portal (`Safebox-AP`, http://192.168.4.1) and persisted to
|      NVS. No WiFi SSID/password is required here.
|   2. MQTT connection uses MQTTS (TLS, port 8883) with username/password
|      auth and a CA certificate for broker verification.
|   3. DEVICE_ID must match the backend `.env` DEVICE_ID so the backend
|      and dashboard associate this device's telemetry correctly.
*/

#pragma once

// Unique device identifier (must match backend DEVICE_ID, e.g. safebox-01)
#define DEVICE_ID "safebox-01"

// EMQX Cloud Serverless broker (MQTTS over TLS, port 8883)
#define MQTT_BROKER_HOST "your-emqx-host.example.com"
#define MQTT_BROKER_PORT 8883

// EMQX basic authentication credentials
#define MQTT_USERNAME "replace-me"
#define MQTT_PASSWORD "replace-me"

// ---------------------------------------------------------------------------
// TLS CA certificate (PEM) for the EMQX broker.
// Obtain from the EMQX Cloud console -> Deployment -> TLS/SSL -> CA certificate.
// Keep the triple-quoted raw string intact, including BEGIN/END lines.
// ---------------------------------------------------------------------------
#define MQTT_CA_CERT \
    "-----BEGIN CERTIFICATE-----\n" \
    "REPLACE_WITH_YOUR_BROKER_CA_CERTIFICATE_PEM\n" \
    "-----END CERTIFICATE-----\n"

// ---------------------------------------------------------------------------
// Optional: pre-provision a WiFi network for first boot.
// Leave commented out to rely on the WiFiManager captive portal only.
// ---------------------------------------------------------------------------
// #define WIFI_SSID "MyNetwork"
// #define WIFI_PASSWORD "MyPassword"
