---
name: iot-backend-engine
description: Express.js REST API standards, Mongoose Time-Series schemas, Z-Score statistical anomaly engine, multi-sensor rule matrix, and Nodemailer email throttling for SafeRoom IoT Box.
---

# IoT Backend Engine Skill

## Architecture Overview

The Node.js / Express.js backend acts as the orchestrator between the MQTT Broker (EMQX), MongoDB Atlas time-series database, Nodemailer transactional email service, and the React frontend dashboard.

---

## MongoDB Atlas Collections (Mongoose Schemas)

### 1. `sensor_readings` (Time-Series Collection)
- Configured as MongoDB Time-Series: `timeField: 'timestamp'`, `metaField: 'deviceId'`, `granularity: 'seconds'`.
- Includes TTL index: `expireAfterSeconds: 2592000` (30-day auto purge).
- Fields: `timestamp`, `deviceId`, `metrics` (temperature, humidity, gasLevel, motionDetected), `actuatorStates` (fanOn, buzzerActive, alertLedActive).

### 2. `anomaly_logs`
- Fields: `deviceId`, `timestamp`, `sensorType`, `triggerType` (`Z_SCORE_EXCEEDED`, `HARD_THRESHOLD_BREACH`, `EDGE_SAFETY_TRIGGER`), `observedValue`, `calculatedZScore`, `thresholdLimit`, `severity` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `actionsTaken`, `resolved`, `resolvedAt`, `resolvedBy`.

### 3. `users`
- Fields: `username`, `email`, `passwordHash` (bcrypt), `notificationPreferences`, `createdAt`.

---

## Z-Score Statistical Anomaly Engine

Z-score calculations apply **exclusively to continuous Gaussian variables** (Temperature & Humidity) over a rolling window of $N = 30$ samples.

$$Z = \frac{x - \mu}{\sigma}$$

- **Anomaly Threshold**: $|Z| > 3.0$ **AND** $|x - \mu| > \Delta_{\text{min\_sense}}$ (minimum physical delta filter to eliminate noise).
- **Cold Start**: If window has `< 30` samples, skip Z-score calculation and fall back to hard limits.
- **Zero Variance**: If $\sigma = 0$, Z-score calculation returns $0.0$.

---

## Multi-Sensor Rule Engine Matrix

| Sensor | Trigger Condition | Severity | Automated Backend Actions |
|---|---|---|---|
| Gas / Smoke (MQ2) | `gasLevel > 600 PPM` | `CRITICAL` | Log anomaly, dispatch email alert immediately |
| Temperature | `temp > 45°C` OR `Z_score(temp) > 3.0` | `HIGH` | Log anomaly, publish Fan ON command (`safebox/{deviceId}/control`) |
| Motion (PIR) | `motionDetected == true` & `SystemArmed == true` | `HIGH` | Log anomaly, dispatch email alert, trigger alert LED |
| Humidity | `Z_score(humidity) > 3.0` | `MEDIUM` | Log anomaly entry |

---

## Transactional Email Alerts & Throttling (Nodemailer)

> [!WARNING]
> Email alerts MUST be debounced to prevent inbox flooding during persistent anomaly conditions.

- **Trigger**: Creation of `HIGH` or `CRITICAL` entries in `anomaly_logs`.
- **Throttling Window**: Maximum **1 email per 15-minute sliding window** per `(deviceId, sensorType)` key.
- **Implementation**: Maintain an in-memory or Redis/DB map of `lastEmailSentAt[deviceId:sensorType]`.

---

## REST API Specification

- `POST /api/v1/auth/register` & `POST /api/v1/auth/login` — Session & Authentication.
- `GET /api/v1/telemetry/latest` — Latest sensor payload for real-time dashboard polling.
- `GET /api/v1/telemetry/historical?from={start}&to={end}&sensor={type}` — Time-range telemetry series.
- `GET /api/v1/anomalies?status=unresolved` — List active anomalies.
- `POST /api/v1/control/actuator` — Publish manual toggle command to MQTT (`{ "actuator": "fan", "state": "on" }`).
- `POST /api/v1/chatbot/query` — Execute rule-based command parsing (`status`, `gas`, `motion`, `temp`, `anomalies`, `help`).
