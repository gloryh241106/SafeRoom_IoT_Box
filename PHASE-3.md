# Phase 3 — Anomaly Engine, Email Alerts & Dashboard Completion (Weeks 3–4)

## Goal

Build the **backend anomaly detection engine** (Z-score for temperature/humidity, hard thresholds for gas/motion), implement **email notifications** via Nodemailer, complete the **historical charting** Dashboard page, and finish **WiFiManager provisioning** polish.

---

## Owner Assignments

| Owner | Task ID | Deliverable |
|-------|---------|-------------|
| **Hoàng** | NC-09 (finish) | WiFiManager provisioning (complete & polish) |
| **Khang** | NC-04 (finish) | Dashboard charts, export features (complete) |
| **Kiệt** | NC-05 | Email notifications via Nodemailer |
| **Kiệt** | NC-01 (start) | Z-score anomaly engine (begin build & test) |

---

## Deliverables

### 1. NC-01 — Z-Score Anomaly Detection Engine (Kiệt, start)

**Backend — Anomaly Engine Module**
- [ ] Implement rolling window buffer (N = 30 samples) per device per metric.
- [ ] On each incoming telemetry message, compute:
  ```
  μ = mean of last 30 readings
  σ = standard deviation of last 30 readings
  Z = (x - μ) / σ
  ```
- [ ] Anomaly condition: `|Z| > 3.0` **AND** `|x - μ| > Δ_min_sense` (minimum sensible deviation to filter noise).
- [ ] Apply Z-score to **temperature** and **humidity** only (per RESOLUTION.md §4).
- [ ] **Multi-Sensor Rule Engine** — implement the full rule matrix:

  | Sensor | Condition | Severity | Actions |
  |--------|-----------|----------|---------|
  | Gas/Smoke (MQ2) | `gasLevel > 600 PPM` | CRITICAL | Log anomaly, send email (instant), edge already triggers buzzer/LED |
  | Temperature | `temp > 45°C` OR `Z_score(temp) > 3.0` | HIGH | Log anomaly, send fan ON command via MQTT |
  | Motion (PIR) | `motionDetected == true` AND `SystemArmed == true` | HIGH | Log anomaly, send email, alert LED + buzzer via MQTT |
  | Humidity | `Z_score(humidity) > 3.0` | MEDIUM | Log anomaly |

- [ ] On anomaly detection, create document in `anomaly_logs`:
  ```javascript
  {
    deviceId: "safebox-01",
    timestamp: new Date(),
    sensorType: "temperature",
    triggerType: "Z_SCORE_EXCEEDED",   // or HARD_THRESHOLD_BREACH, EDGE_SAFETY_TRIGGER
    observedValue: 47.2,
    calculatedZScore: 3.45,            // null for threshold-based
    thresholdLimit: 45,                // or the Z-score threshold (3.0)
    severity: "HIGH",
    actionsTaken: ["FAN_ON", "ANOMALY_LOGGED"],
    resolved: false
  }
  ```
- [ ] Expose `GET /api/v1/anomalies?status=unresolved` — return active anomaly logs.

### 2. NC-05 — Email Notifications (Kiệt)

**Backend — Nodemailer Integration**
- [ ] Install and configure `nodemailer` with SMTP over TLS (port 465 or 587).
- [ ] Add `.env` variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ALERT_RECIPIENT_EMAIL`.
- [ ] Email dispatch function:
  - Triggered on creation of `HIGH` or `CRITICAL` severity entries in `anomaly_logs`.
  - Email contains: anomaly type, sensor value, threshold, timestamp, device ID.
- [ ] **Throttling/Debouncing**: Maximum 1 email per anomaly type per 15-minute sliding window.
  - Track last email timestamp per `(deviceId, sensorType)` combination.
  - Skip dispatch if within the 15-minute window.
- [ ] HTML email template with clear alert formatting.

### 3. NC-04 — Dashboard Page Completion (Khang)

**Frontend — Dashboard Page**
- [ ] Complete all four Recharts line charts:
  - Temperature vs. time
  - Humidity vs. time
  - Gas level vs. time
  - Light intensity vs. time
- [ ] Time-range presets: 1h, 6h, 24h, 7d, custom date picker.
- [ ] Chart interactions: tooltips, zoom, responsive sizing.
- [ ] **Export Telemetry**: download current chart data as CSV.
- [ ] Anomaly overlay: mark anomaly events on the timeline (optional badge/marker).
- [ ] Loading skeletons and error states.

### 4. NC-09 — WiFiManager Provisioning (Hoàng, finish)

**ESP32 Firmware**
- [ ] Polish captive portal UX (timeout, retry behavior).
- [ ] Ensure graceful fallback: if saved WiFi network is unavailable, re-enter SoftAP mode after configurable timeout.
- [ ] Display provisioning status on OLED (e.g., "Connecting...", "AP Mode: Safebox-AP", "Connected: 192.168.x.x").
- [ ] Validate that credentials persist in NVS across power cycles.

---

## Backend Alert Flow Diagram

```text
Telemetry Message
       │
       ▼
 ┌─────────────┐
 │ Rule Engine  │──── Gas > 600?  ───► CRITICAL anomaly_log + Email (instant)
 │              │──── Temp > 45°C? ──► HIGH anomaly_log + Fan ON command
 │              │──── Z(temp) > 3? ──► HIGH anomaly_log + Fan ON command
 │              │──── Z(hum) > 3?  ──► MEDIUM anomaly_log
 │              │──── Motion+Armed?──► HIGH anomaly_log + Email + Alert
 └─────────────┘
       │
       ▼
 ┌─────────────┐     ┌──────────────┐
 │ anomaly_logs│     │  Nodemailer  │
 │  .create()  │     │  (throttled) │
 └─────────────┘     └──────────────┘
```

---

## API Endpoints Added in This Phase

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/anomalies` | Query anomaly logs (filter by `status`, `severity`, `sensorType`) |

---

## Verification Checklist

- [ ] **V3-01**: Applying a heat source near DHT22 triggers a Z-score anomaly after sufficient baseline samples (TC-04).
- [ ] **V3-02**: Anomaly document created in `anomaly_logs` with correct schema fields.
- [ ] **V3-03**: `GET /api/v1/anomalies?status=unresolved` returns the anomaly.
- [ ] **V3-04**: Gas anomaly (CRITICAL) triggers email within < 5 seconds (TC-05).
- [ ] **V3-05**: Repeat gas trigger within 15 minutes does NOT send a second email (throttle works).
- [ ] **V3-06**: Temperature anomaly triggers Fan ON command via MQTT.
- [ ] **V3-07**: Dashboard page shows all four charts with real data.
- [ ] **V3-08**: CSV export downloads correctly formatted data.
- [ ] **V3-09**: WiFiManager provisioning works end-to-end including NVS persistence across power cycles (TC-01).

---

## Exit Criteria

Phase 3 is **complete** when:
1. Z-score anomaly detection fires correctly for temperature and humidity.
2. Hard-threshold rules fire for gas and motion events.
3. Email notifications dispatch on HIGH/CRITICAL anomalies with proper throttling.
4. Dashboard page is fully functional with all charts and export.
5. WiFiManager provisioning is polished and reliable.
