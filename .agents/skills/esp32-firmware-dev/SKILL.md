---
name: esp32-firmware-dev
description: Guidelines, pinout mappings, edge safety autonomy, WiFiManager captive portal, and MQTTS pub/sub patterns for ESP32 firmware in SafeRoom IoT Box.
---

# ESP32 Firmware Development Skill

## Hardware Pinout Reference

| GPIO Pin | Sensor / Actuator | Mode / Interface | Purpose / Notes |
|---|---|---|---|
| GPIO 4 | DHT22 Temperature & Humidity | Input (Digital / OneWire) | Single-bus readings every 2000ms |
| GPIO 13 | PIR HC-SR501 Motion | Input (Digital Interrupt) | High/Low motion detection signal |
| GPIO 34 | MQ2 Gas / Smoke Sensor | Input (Analog ADC1_CH6) | Gas level readings (0-4095 raw -> PPM) |
| GPIO 16 | DC Fan Relay | Output (Digital Output) | 5V Optocoupler Relay control (polarity per `RELAY_ACTIVE_LOW`; HL-52S = LOW energizes) |
| GPIO 18 | Alert LED (Red) | Output (Digital Output / PWM) | Visual alarm indicator |
| GPIO 19 | Active Buzzer | Output (PWM via LEDC) | Audible alert tone generation |
| GPIO 21 | SSD1306 OLED (SDA) | I2C Data | Local display data line |
| GPIO 22 | SSD1306 OLED (SCL) | I2C Clock | Local display clock line |

---

## Edge-Local Safety Autonomy (Offline Mode)

> [!IMPORTANT]
> Edge safety for gas/smoke detection MUST operate autonomously inside the main loop without depending on WiFi or backend response.

- **Gas Trigger Rule**: If `gasLevel > 600 PPM`:
  - Instantly trigger **Buzzer** (PWM pattern on GPIO 19) and **Alert LED** (HIGH on GPIO 18).
  - Update **OLED display** with local warning text.
  - Response time MUST be `< 200 ms` from read to actuation, independent of cloud state.
- **Cloud Alerting**: When connected, publish an edge alert immediately to `safebox/{deviceId}/alerts` with QoS 1:
  ```json
  {
    "type": "EDGE_SAFETY_TRIGGER",
    "sensorType": "gasLevel",
    "observedValue": 720,
    "threshold": 600,
    "timestamp": 1719000000000
  }
  ```

---

## WiFiManager Provisioning Flow

1. On boot, attempt WiFi connection using stored NVS credentials (30s timeout).
2. If connection fails or credentials are missing:
   - Spin up SoftAP named `Safebox-AP`.
   - Launch Captive Portal at `192.168.4.1`.
   - Update OLED display: `AP Mode: Safebox-AP`.
3. Upon user submission, save credentials to NVS and reboot into Station mode.
4. Display connected IP address on SSD1306 OLED display upon successful connection.

---

## MQTT Communication Patterns

- **Broker**: MQTTS over TLS (Port 8883) with Username & Password authentication.
- **Telemetry Payload** (`safebox/{deviceId}/telemetry`, QoS 0, every 2s):
  ```json
  {
    "timestamp": 1719000000000,
    "deviceId": "safebox-01",
    "metrics": {
      "temperature": 28.5,
      "humidity": 65.2,
      "gasLevel": 180,
      "lightIntensity": 450,
      "motionDetected": false
    },
    "actuatorStates": {
      "fanOn": false,
      "buzzerActive": false,
      "alertLedActive": false
    }
  }
  ```
- **Last Will and Testament (LWT)** (`safebox/{deviceId}/status`, QoS 1, Retained):
  - LWT payload on disconnect: `{"status": "offline"}`
  - Connect payload: `{"status": "online"}`
- **Actuator Commands** (`safebox/{deviceId}/control`, QoS 1):
  - Listen for JSON commands: `{"actuator": "fan", "state": "on"}` and toggle GPIO pins accordingly.
