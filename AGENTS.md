# SafeRoom IoT Box (Safebox) — Agent Guidelines & Project Rules

This document outlines team roles, code architecture rules, task tracking, documentation maintenance rules, and verification workflows for agents collaborating on the **SafeRoom IoT Box ("Safebox")** project.

---

## 1. Project Overview & Task Registry

SafeRoom IoT Box is a 5-week university coursework project (HCMUS, 3 team members: Hoàng, Khang, Kiệt) combining ESP32 hardware sensing, cloud MQTT messaging (EMQX), Express.js backend, MongoDB Atlas time-series storage, Z-score anomaly detection, Nodemailer alerts, and a React web dashboard ("SafeboxManager").

All tasks are tracked in a single **[TODO.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md)**, classified by system layer:

| Section | Layer | Scope |
|---------|-------|-------|
| §1 | **Hardware / ESP32 Firmware** | Sensor wiring, actuator wiring, MQTT comms, edge safety, WiFiManager, firmware stability |
| §2 | **Backend (Express.js)** | Server scaffold, auth, telemetry API, actuator control, anomaly engine, email, chatbot, user profile, hardening |
| §3 | **Database (MongoDB Atlas)** | Cluster setup, schemas, time-series configuration |
| §4 | **Frontend (React + Vite + Tailwind)** | Scaffold, auth pages, Overview, Dashboard, Chatbot, Settings, i18n, polish |
| §5 | **Messaging Infrastructure (EMQX)** | Broker setup, MQTT topic registry |
| §6 | **Documentation & Testing** | README, inline comments, TC-01 to TC-06, demo preparation |
| §7 | **Stretch Goals** | Socket.IO, LLM chatbot, local fan auto-trigger, anomaly resolution |

> **Task completion convention**: Finished tasks use `[x]`. Pending tasks use `[ ]`.

---

## 2. Technical Stack & Hardware Pinouts

### Tech Stack
- **Firmware**: Arduino C++ (ESP32 DevKit V1), WiFiManager, PubSubClient (MQTTS).
- **Backend**: Node.js, Express.js REST API, Mongoose ODM, MQTT client (`mqtt`), Nodemailer.
- **Database**: MongoDB Atlas (Time-Series collection `sensor_readings`, standard collections `anomaly_logs`, `users`).
- **Messaging**: EMQX Cloud Serverless (MQTTS Port 8883, TLS, basic auth).
- **Frontend**: React, Vite, Tailwind CSS, Recharts, Lucide Icons.

### Hardware Pinout Matrix
- **GPIO 4**: DHT22 Temp/Humidity (Digital Input)
- **GPIO 13**: PIR HC-SR501 Motion (Digital Interrupt)
- **GPIO 34**: MQ2 Gas/Smoke Sensor (Analog Input ADC1_CH6)
- **GPIO 16**: DC Fan Relay (Digital Output, HIGH = ON)
- **GPIO 17**: Status LED Green (Digital Output / PWM)
- **GPIO 18**: Alert LED Red (Digital Output / PWM)
- **GPIO 19**: Active Buzzer (PWM via LEDC)
- **GPIO 21 / 22**: SSD1306 OLED (I2C SDA / SCL)

---

## 3. Strict Architectural Directives

1. **Edge Safety Autonomy**: MQ2 gas detection (`gasLevel > 600 PPM`) MUST trigger the buzzer (GPIO 19), alert LED (GPIO 18), and OLED warning locally on the ESP32 in `< 200 ms` without waiting for backend network response.
2. **Fan Control Scope**: Fan control is mediated by the remote backend via MQTT (`safebox/{deviceId}/control`). Do NOT add unrequested local firmware auto-triggers for the fan unless explicitly instructed.
3. **Z-Score Boundaries**: Apply statistical Z-score calculations ($|Z| > 3.0$ over rolling $N=30$ window) ONLY to continuous variables (Temperature, Humidity). Gas and motion use hard thresholds and state change rules.
4. **Chatbot Architecture**: The `/api/v1/chatbot/query` route is a pre-programmed conditional keyword router (`status`, `gas`, `motion`, `temp`, `humidity`, `anomalies`, `help`). Do NOT introduce external LLM dependencies unless core scope is complete.
5. **Real-time Telemetry**: REST polling (`GET /api/v1/telemetry/latest` every 2–5s) is the baseline interface. Socket.IO is strictly a stretch enhancement.
6. **Email Debouncing**: Nodemailer alerts MUST enforce a 15-minute sliding window throttle per `(deviceId, sensorType)` key.

---

## 4. Documentation Maintenance Directive (Mandatory Rule)

> [!IMPORTANT]
> **Pre-Implementation & Post-Implementation Documentation Protocol**:
> 1. **Before writing any code**, add the planned task(s) as `[ ]` items to the correct section of **[TODO.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md)**.
> 2. **After completing** each task, mark it `[x]` in TODO.md and ensure pending items accurately reflect the current codebase.
> 3. **[README.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/README.md)**: Keep architecture diagrams, endpoint references, setup instructions, hardware pinouts, and tech stack summaries fully up to date at the end of every session.

---

## 5. Verification Protocol (TC-01 to TC-06)

Always run verification commands and check empirical logs before declaring task completion:
- **TC-01 (WiFi Provisioning)**: Verify captive portal `Safebox-AP` at `192.168.4.1`, NVS credential persistence, and OLED IP rendering.
- **TC-02 (Telemetry Pipeline)**: Verify 2s periodic telemetry ingestion from ESP32 -> EMQX -> MongoDB `sensor_readings`.
- **TC-03 (Edge Safety Autonomy)**: Verify offline gas breach response time (< 200ms) with WiFi disconnected.
- **TC-04 (Z-Score Engine)**: Verify temp spike triggers Z-score > 3.0, creates `anomaly_logs` entry, and alerts frontend UI.
- **TC-05 (Nodemailer)**: Verify email alert dispatch within < 5s on CRITICAL anomaly, and verify 15-minute debouncing window.
- **TC-06 (Remote Override)**: Verify toggling DC Fan on Overview web page actuates hardware relay in < 500ms.
