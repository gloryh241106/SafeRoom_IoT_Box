# SafeRoom IoT Box (Safebox) — Integration TODO & Real Connection Guide

This document tracks all mock components, mock connections, and mock dataset generators in the current codebase, along with step-by-step instructions to connect to real hardware, real MQTT brokers, real SMTP servers, and statistical Z-score calculations.

---

## 1. Real EMQX MQTT Broker Connection (Hardware & Backend)

### Current Mock Implementation
- Located in: `backend/services/mockTelemetryGenerator.js`
- Generates simulated sensor readings (DHT22, PIR, MQ2) every 2 seconds into MongoDB Atlas.

### How to Connect to Real MQTT Broker:
1. Open [backend/services/mockTelemetryGenerator.js](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/services/mockTelemetryGenerator.js).
2. Uncomment the `initRealMqttClient()` template block.
3. Install `mqtt` npm package: `npm install mqtt` inside `backend/`.
4. Configure your EMQX Cloud credentials in `backend/.env`:
   ```env
   MQTT_BROKER_URL=mqtts://broker.emqx.io:8883
   MQTT_USERNAME=safebox_admin
   MQTT_PASSWORD=your_emqx_password
   ```
5. Uncomment real actuator command publishing in [backend/routes/control.js](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/control.js):
   ```javascript
   global.mqttClient.publish(`safebox/${deviceId}/control`, JSON.stringify({ actuator, state: state ? 'on' : 'off' }), { qos: 1 });
   ```

---

## 2. Real Nodemailer SMTP Email Alerts

### Current Mock Implementation
- Located in: `backend/services/emailService.js`
- Logs simulated alert dispatches (HIGH and CRITICAL severity only) to console while enforcing a 15-minute sliding window throttle per `(deviceId, sensorType)` key.

### How to Enable Real Email Dispatches:
1. Open [backend/services/emailService.js](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/services/emailService.js).
2. Install `nodemailer`: `npm install nodemailer` inside `backend/`.
3. Uncomment the `nodemailer.createTransport()` code block.
4. Set real SMTP environment variables in `backend/.env`:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_app_password
   ALERT_RECIPIENT_EMAIL=admin@safebox.io
   ```

---

## 3. Statistical Z-Score Anomaly Engine ($|Z| > 3.0$)

### Current Implementation
- Located in: `backend/services/anomalyEngine.js`
- Supports runtime switching between **Manual Bounds** and **Automatic Z-Score Engine**:
  - **Manual Mode (Automatic OFF)**:
    - Gas Level: `gasLevel > gasMax` (`CRITICAL`)
    - Temperature: `temp > tempMax` or `< tempMin` (`HIGH`)
    - Motion: `motionDetected == true` when system armed (`LOW`)
    - Humidity: `humidity > humidityMax` or `< humidityMin` (`MEDIUM`)
  - **Automatic Mode (Automatic ON)**:
    - Continuous metrics (Temperature & Humidity) use rolling $N=30$ window statistical Z-score calculations ($|Z| > \text{zScoreLimit}$).

---

## 4. ESP32 Hardware Firmware Deployment

### Current Implementation
- Firmware specifications detailed in [esp32-firmware-dev skill](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/.agents/skills/esp32-firmware-dev/SKILL.md) and [PHASE-1.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-1.md) through [PHASE-5.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-5.md).

### Pinout Reference to Connect Hardware:
- **GPIO 4**: DHT22 Temp/Humidity (Digital Input)
- **GPIO 13**: PIR HC-SR501 Motion (Digital Interrupt)
- **GPIO 34**: MQ2 Gas/Smoke Sensor (Analog ADC1_CH6)
- **GPIO 16**: DC Fan Relay Module (Digital Output, HIGH = ON)
- **GPIO 17**: Status LED Green (Digital Output)
- **GPIO 18**: Alert LED Red (Digital Output)
- **GPIO 19**: Active Buzzer (PWM via LEDC)
- **GPIO 21 / 22**: SSD1306 OLED (I2C SDA / SCL)
