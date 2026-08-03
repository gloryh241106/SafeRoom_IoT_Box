# Phase 1 — Foundation & End-to-End Vertical Slices (Weeks 1–2)

## Goal

Stand up every infrastructure layer (ESP32 firmware skeleton, EMQX broker, Express.js backend, MongoDB Atlas, React frontend scaffold) and prove **three end-to-end data pipelines** work simultaneously. By the end of Phase 1 every team member has shipped one complete vertical slice from sensor/UI to UI/actuator.

---

## Owner Assignments

| Owner | Task ID | Deliverable |
|-------|---------|-------------|
| **Hoàng** | CB-01 | DHT22 → ESP32 → MQTT → Backend → Frontend |
| **Khang** | CB-02 | PIR → ESP32 → MQTT → Backend → Frontend |
| **Khang** | NC-08 (start) | Website scaffold (React + Tailwind, routing, layout) — ongoing through Week 5 |
| **Kiệt** | CB-03 | Frontend → Backend → MQTT → ESP32 → Relay/Fan |

---

## Deliverables

### 1. Infrastructure Bootstrap (shared, first few days)

- [ ] Create **EMQX Cloud Serverless** free-tier instance; note broker URL, port 8883, and credentials.
- [ ] Provision **MongoDB Atlas** free-tier cluster; create database `safebox` with collections:
  - `sensor_readings` (Time-Series, `timeField: 'timestamp'`, `metaField: 'deviceId'`, `granularity: 'seconds'`, `expireAfterSeconds: 2592000`)
  - `anomaly_logs`
  - `users`
- [ ] Scaffold **Express.js** backend project:
  - `npm init`, install `express`, `mongoose`, `mqtt`, `dotenv`, `cors`
  - `.env` for `MONGO_URI`, `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`
  - Basic server boot (`app.listen`) + Mongoose connection
- [ ] Scaffold **React** frontend (Vite):
  - Install `react-router-dom`, `tailwindcss`, `recharts`, `lucide-react`
  - Set up routing skeleton: `/overview`, `/dashboard`, `/chatbot`, `/settings`
  - Shared layout with sidebar/navbar

### 2. CB-01 — Temperature & Humidity Pipeline (Hoàng)

**ESP32 Firmware**
- [ ] Wire **DHT22** to GPIO 4 (with pull-up resistor).
- [ ] Read temperature + humidity every 2 000 ms.
- [ ] Connect to EMQX via MQTTS (port 8883, username/password auth, TLS).
- [ ] Publish JSON to `safebox/{deviceId}/telemetry` (QoS 0):
  ```json
  {
    "timestamp": 1719000000000,
    "deviceId": "safebox-01",
    "metrics": {
      "temperature": 28.5,
      "humidity": 65.2,
      "gasLevel": 0,
      "lightIntensity": 0,
      "motionDetected": false
    }
  }
  ```
- [ ] Configure **LWT** on `safebox/{deviceId}/status` with payload `{"status":"offline"}` (QoS 1, retained).
- [ ] On connect, publish `{"status":"online"}` to status topic (QoS 1, retained).

**Backend**
- [ ] MQTT client subscribes to `safebox/+/telemetry`.
- [ ] On message: validate payload, write to `sensor_readings` via `SensorReading.create()`.
- [ ] Expose `GET /api/v1/telemetry/latest` — returns the most recent document for the device.

**Frontend**
- [ ] Overview page: live Temperature and Humidity cards, polling `/telemetry/latest` every 3 s.

### 3. CB-02 — Motion Detection Pipeline (Khang)

**ESP32 Firmware**
- [ ] Wire **PIR HC-SR501** to GPIO 13 (digital interrupt).
- [ ] On state change (LOW→HIGH), immediately publish telemetry with `motionDetected: true`.
- [ ] Include motion state in the periodic 2 s telemetry payload.

**Backend**
- [ ] Already handled by the shared `safebox/+/telemetry` subscription from CB-01.

**Frontend**
- [ ] Overview page: Motion status indicator card (active/idle + last-seen timestamp).

### 4. CB-03 — Remote Fan Control Pipeline (Kiệt)

**ESP32 Firmware**
- [ ] Wire **DC Fan relay** to GPIO 16 (digital output, HIGH = ON).
- [ ] Subscribe to `safebox/{deviceId}/control` (QoS 1).
- [ ] On message `{"actuator":"fan","state":"on"}` → set GPIO 16 HIGH; `"off"` → LOW.
- [ ] Include `actuatorStates.fanOn` in telemetry payloads.

**Backend**
- [ ] Expose `POST /api/v1/control/actuator`:
  ```json
  { "deviceId": "safebox-01", "actuator": "fan", "state": "on" }
  ```
- [ ] On request: publish to `safebox/{deviceId}/control` (QoS 1).

**Frontend**
- [ ] Overview page: Fan toggle switch; sends POST to `/control/actuator`, reflects state from polled telemetry.

### 5. NC-08 — Website Scaffold (Khang, ongoing)

- [ ] Four-page React Router layout: Overview, Dashboard, Chatbot, Settings.
- [ ] Responsive sidebar + header with Lucide icons.
- [ ] Tailwind design tokens (colors, spacing, typography).
- [ ] Placeholder content on Dashboard, Chatbot, Settings pages.

---

## MQTT Topics Used in This Phase

| Topic | Direction | QoS |
|-------|-----------|-----|
| `safebox/{deviceId}/telemetry` | ESP32 → Backend | 0 |
| `safebox/{deviceId}/status` | ESP32 → Backend (LWT) | 1 (retained) |
| `safebox/{deviceId}/control` | Backend → ESP32 | 1 |

---

## Hardware Wiring for This Phase

| GPIO | Device | Mode |
|------|--------|------|
| 4 | DHT22 | Input (Digital/OneWire) |
| 13 | PIR HC-SR501 | Input (Digital Interrupt) |
| 16 | DC Fan Relay | Output (Digital) |

---

## Verification Checklist

- [ ] **V1-01**: ESP32 serial monitor shows DHT22 readings every 2 s.
- [ ] **V1-02**: EMQX Cloud console shows messages arriving on `safebox/+/telemetry`.
- [ ] **V1-03**: MongoDB Atlas shows documents in `sensor_readings` with correct schema.
- [ ] **V1-04**: Frontend Overview page displays live temperature and humidity values.
- [ ] **V1-05**: PIR state change appears on the frontend within one polling cycle (~3 s).
- [ ] **V1-06**: Toggling the Fan switch on the frontend causes the relay to click within < 500 ms (TC-06).
- [ ] **V1-07**: Powering off ESP32 causes LWT `offline` status to appear in EMQX.
- [ ] **V1-08**: Website has four navigable routes with layout intact.

---

## Exit Criteria

Phase 1 is **complete** when:
1. All three vertical slices (DHT22 telemetry, PIR telemetry, Fan control) work end-to-end.
2. Data persists in MongoDB Atlas `sensor_readings`.
3. The React website scaffold is navigable with live data on the Overview page.
4. The ESP32 publishes LWT and reconnects gracefully.
