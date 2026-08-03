# SafeRoom IoT Box (Safebox) — Agent Guidelines & Project Rules

This document outlines team roles, code architecture rules, phase implementation boundaries, documentation maintenance rules, and verification workflows for agents collaborating on the **SafeRoom IoT Box ("Safebox")** project.

---

## 1. Project Overview & Phase Roadmap Summary

SafeRoom IoT Box is a 5-week university coursework project (HCMUS, 3 team members: Hoàng, Khang, Kiệt) combining ESP32 hardware sensing, cloud MQTT messaging (EMQX), Express.js backend, MongoDB Atlas time-series storage, Z-score anomaly detection, Nodemailer alerts, and a React web dashboard ("SafeboxManager").

Detailed deliverables are split across 5 phase documents:
- [PHASE-1.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-1.md) — Weeks 1–2: Infrastructure Bootstrap & End-to-End Vertical Slices (CB-01, CB-02, CB-03, NC-08 start).
- [PHASE-2.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-2.md) — Weeks 2–3: User Authentication (NC-07), MQ2/LDR Edge Safety & Local Alerts (NC-02), MongoDB Time-Series (NC-03), Dashboard Charts (NC-04 start), WiFiManager (NC-09 start).
- [PHASE-3.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-3.md) — Weeks 3–4: Z-Score Anomaly Engine (NC-01 start), Email Notifications (NC-05), Dashboard Charts (NC-04 finish), WiFiManager Polish (NC-09 finish).
- [PHASE-4.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-4.md) — Weeks 4–5: Rule-based Chatbot (NC-06), Z-Score Finalization & Edge Cases (NC-01 finish), Settings Page.
- [PHASE-5.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-5.md) — Week 5 (final): System Integration Testing (TC-01..TC-06), Quality Polish & Demonstration.

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
- **GPIO 35**: LDR Light Sensor (Analog Input ADC1_CH7)
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
> **Post-Implementation Documentation Protocol**:
> At the conclusion of **EVERY implementation session**, code change, or feature addition, agents MUST automatically inspect and update both:
> 1. **[TODO.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md)**: Ensure all mock data generators, mock services, connection templates, and pending hardware integration steps accurately reflect the current codebase.
> 2. **[README.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/README.md)**: Ensure project architecture diagrams, endpoint references, setup instructions, hardware pinouts, and tech stack summaries are kept fully up to date.

---

## 5. Verification Protocol (TC-01 to TC-06)

Always run verification commands and check empirical logs before declaring task completion:
- **TC-01 (WiFi Provisioning)**: Verify captive portal `Safebox-AP` at `192.168.4.1`, NVS credential persistence, and OLED IP rendering.
- **TC-02 (Telemetry Pipeline)**: Verify 2s periodic telemetry ingestion from ESP32 -> EMQX -> MongoDB `sensor_readings`.
- **TC-03 (Edge Safety Autonomy)**: Verify offline gas breach response time (< 200ms) with WiFi disconnected.
- **TC-04 (Z-Score Engine)**: Verify temp spike triggers Z-score > 3.0, creates `anomaly_logs` entry, and alerts frontend UI.
- **TC-05 (Nodemailer)**: Verify email alert dispatch within < 5s on CRITICAL anomaly, and verify 15-minute debouncing window.
- **TC-06 (Remote Override)**: Verify toggling DC Fan on Overview web page actuates hardware relay in < 500ms.
