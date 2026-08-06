# SafeRoom IoT Box (Safebox) — Master Task Registry

All tasks from PHASE-1 through PHASE-5 compacted into a single file, classified by system layer.
Use `[x]` for completed items, `[ ]` for pending.

---

## 1. Hardware / ESP32 Firmware

### 1.1 Sensor Wiring & Reading

- [ ] Wire **DHT22** to GPIO 4 (pull-up resistor), read temp + humidity every 2 000 ms `(CB-01)`
- [ ] Wire **PIR HC-SR501** to GPIO 13 (digital interrupt), detect LOW→HIGH state change `(CB-02)`
- [ ] Wire **MQ2 gas sensor** analog to GPIO 34 (ADC1_CH6), heater to 5V rail `(NC-02)`
- [ ] Wire **LDR** to GPIO 35 (ADC1_CH7) via voltage divider `(NC-02)`

### 1.2 Actuator Wiring & Control

- [ ] Wire **DC Fan relay** to GPIO 16 (HIGH = ON) `(CB-03)`
- [ ] Wire **Alert LED (Red)** to GPIO 18 (digital output) `(NC-02)`
- [ ] Wire **Status LED (Green)** to GPIO 17 (digital output) `(NC-02)`
- [ ] Wire **Active Buzzer** to GPIO 19 (PWM via LEDC) `(NC-02)`
- [ ] Wire **SSD1306 OLED** to GPIO 21 (SDA) / GPIO 22 (SCL) via I2C `(NC-02)`

### 1.3 MQTT Communication

- [ ] Connect to EMQX via MQTTS (port 8883, TLS, username/password auth) `(CB-01)`
- [ ] Publish JSON telemetry to `safebox/{deviceId}/telemetry` (QoS 0) every 2s `(CB-01)`
- [ ] Configure **LWT** on `safebox/{deviceId}/status` with `{"status":"offline"}` (QoS 1, retained) `(CB-01)`
- [ ] On connect, publish `{"status":"online"}` to status topic (QoS 1, retained) `(CB-01)`
- [x] Subscribe to `safebox/{deviceId}/control` (QoS 1) for fan commands `(CB-03)`
- [x] On message `{"actuator":"fan","state":"on"}` → GPIO 16 HIGH; `"off"` → LOW `(CB-03)`
- [ ] Include `actuatorStates.fanOn`, `.buzzerActive`, `.alertLedActive` in telemetry `(CB-03, NC-02)`
- [ ] Include `gasLevel`, `lightIntensity` in periodic telemetry payloads `(NC-02)`
- [ ] Include `motionDetected` from PIR state in periodic telemetry `(CB-02)`

### 1.4 Edge-Local Safety Logic

- [ ] If `gasLevel > 600 PPM` → immediately activate Buzzer + Alert LED + OLED warning (< 200 ms, no network needed) `(NC-02, TC-03)`
- [ ] Publish edge alert to `safebox/{deviceId}/alerts` (QoS 1) on gas breach `(NC-02)`
- [ ] OLED display: cycle through current sensor values (temp, humidity, gas, light, motion) `(NC-02)`

### 1.5 WiFiManager Provisioning

- [ ] Integrate **WiFiManager** Arduino library `(NC-09)`
- [ ] On boot: attempt saved WiFi from NVS; if fail after 30s → SoftAP `Safebox-AP` `(NC-09)`
- [ ] Captive portal at `192.168.4.1` for credential input `(NC-09)`
- [ ] Save credentials to NVS, reboot into Station mode `(NC-09)`
- [ ] Display assigned IP on OLED after WiFi connection `(NC-09)`
- [ ] Polish: timeout, retry, graceful fallback to SoftAP if network lost `(NC-09)`
- [ ] Display provisioning status on OLED ("Connecting...", "AP Mode: Safebox-AP", "Connected: x.x.x.x") `(NC-09)`

### 1.6 Firmware Stability & Polish (Phase 5)

- [ ] Reconnect MQTT with exponential backoff; continue local safety alerts while disconnected
- [ ] Clean up debug `Serial.println` (guard behind debug flag)
- [ ] Validate all 4 sensors (DHT22, PIR, MQ2, LDR) reading correctly
- [ ] Validate all 5 actuators (Fan relay, Status LED, Alert LED, Buzzer, OLED) responding

---

## 2. Backend (Express.js)

### 2.1 Server Scaffold & Middleware

- [x] Scaffold Express.js project (`express`, `mongoose`, `dotenv`, `cors`) `(CB-01)`
- [x] `.env` for `MONGO_URI` `(CB-01)`
- [x] Basic server boot (`app.listen`) + Mongoose connection `(CB-01)`
- [x] Request logging middleware `(CB-01)`
- [x] Health check endpoint `GET /health`

### 2.2 Authentication (NC-07)

- [x] `POST /api/v1/auth/register` — validate, hash password (bcrypt), create user `(NC-07)`
- [x] `POST /api/v1/auth/login` — verify credentials, return JWT token `(NC-07)`
- [x] `GET /api/v1/auth/me` — return current user from token `(NC-07)`
- [ ] Auth middleware to protect API routes (`/telemetry/*`, `/control/*`, `/anomalies/*`) `(NC-07)`

### 2.3 Telemetry Ingestion & API

- [x] Mock telemetry generator (`mockTelemetryGenerator.js`) simulating DHT22, PIR, MQ2 every 2s `(CB-01)`
- [x] `GET /api/v1/telemetry/latest` — returns most recent document for device `(CB-01)`
- [x] `GET /api/v1/telemetry/historical?from=&to=&sensor=` — historical query `(NC-03)`
- [x] Replace mock generator with real MQTT client subscribing to `safebox/+/telemetry` `(CB-01)`
- [x] On MQTT message: validate payload, write to `sensor_readings` via `SensorReading.create()` `(CB-01)`

### 2.4 Remote Actuator Control

- [x] `POST /api/v1/control/actuator` — accepts `{deviceId, actuator, state}` `(CB-03)`
- [x] Publish real MQTT command to `safebox/{deviceId}/control` (QoS 1) `(CB-03)`

### 2.5 Anomaly Detection Engine (NC-01)

- [x] Rolling window buffer (N=30) per device per metric `(NC-01)`
- [x] Z-score computation: μ, σ, Z = (x - μ) / σ, anomaly if |Z| > limit `(NC-01)`
- [x] Apply Z-score to temperature and humidity only `(NC-01)`
- [x] Multi-sensor rule engine (gas CRITICAL, temp HIGH, motion HIGH, humidity MEDIUM) `(NC-01)`
- [x] Create `anomaly_logs` document on detection `(NC-01)`
- [x] Runtime switching: Manual Bounds vs. Automatic Z-Score mode `(NC-01)`
- [x] Validate Z-score with controlled test data (30 stable → spike → confirm anomaly) `(NC-01)`
- [x] Edge case: cold start (<30 samples) → skip Z-score, rely on hard thresholds `(NC-01)`
- [x] Edge case: σ = 0 (identical readings) → treat as no anomaly `(NC-01)`
- [x] Edge case: rapid repeated anomalies → deduplication `(NC-01)`
- [x] Subscribe to `safebox/+/alerts` for edge alerts → create `EDGE_SAFETY_TRIGGER` entries `(NC-01)`
- [x] Δ_min_sense filter to prevent micro-fluctuation false positives `(NC-01)`

### 2.6 Anomaly Logs API

- [x] `GET /api/v1/anomalies?status=unresolved` — return active anomaly logs `(NC-01)`
- [x] `DELETE /api/v1/anomalies` — delete all anomaly logs `(NC-01)`

### 2.7 Email Notifications (NC-05)

- [x] Email dispatch function with 15-minute sliding window throttle per `(deviceId, sensorType)` `(NC-05)`
- [x] Triggered on `HIGH` or `CRITICAL` severity anomalies only `(NC-05)`
- [x] Replace mock email with real Nodemailer SMTP transport (`nodemailer.createTransport()`) `(NC-05)`
- [x] Configure `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ALERT_RECIPIENT_EMAIL` `(NC-05)`
- [x] HTML email template with clear alert formatting `(NC-05)`

### 2.8 Chatbot Command Router (NC-06)

- [x] `POST /api/v1/chatbot/query` — keyword router `(NC-06)`
- [x] Commands: `status`, `gas`, `motion`, `temp`/`temperature`, `humidity`, `anomalies`, `help` `(NC-06)`
- [x] Unrecognized input returns friendly error message `(NC-06)`
- [x] Response format: `{ reply, data, timestamp }` `(NC-06)`

### 2.9 User Profile API

- [x] `GET /api/v1/users/profile` — return user profile `(Settings)`
- [x] `PATCH /api/v1/users/profile` — update password, notification preferences `(Settings)`

### 2.10 Backend Hardening (Phase 5)

- [ ] Input validation on all API endpoints (reject malformed requests with proper error codes)
- [ ] Error handling middleware (catch-all, return JSON `{ success, data, error }`)
- [ ] Environment variable validation on startup (fail fast if required vars missing)
- [ ] API response consistency: standard envelope format
- [x] Handle MQTT broker disconnect/reconnect gracefully

---

## 3. Database (MongoDB Atlas)

### 3.1 Cluster & Collections

- [x] Provision MongoDB Atlas free-tier cluster `(CB-01)`
- [x] Create database `safebox` `(CB-01)`
- [x] `sensor_readings` collection `(CB-01)`
- [x] `anomaly_logs` collection `(CB-01)`
- [x] `users` collection `(NC-07)`

### 3.2 Schemas

- [x] `SensorReadingSchema` (timestamp, deviceId, metrics, actuatorStates) `(NC-03)`
- [x] `AnomalyLogSchema` (deviceId, timestamp, sensorType, triggerType, observedValue, calculatedZScore, thresholdLimit, severity, actionsTaken, resolved) `(NC-01)`
- [x] `UserSchema` (username, email, passwordHash, settings { emailEnabled, thresholds { gasMax, tempMax, tempMin, humidityMax, humidityMin, zScoreLimit, isAutomatic } }, createdAt) `(NC-07)`

### 3.3 Time-Series Configuration

- [x] Verify `sensor_readings` is configured as MongoDB Time-Series: `timeField: 'timestamp'`, `metaField: 'deviceId'`, `granularity: 'seconds'`, `expireAfterSeconds: 2592000` `(NC-03)`
- [x] Validate Time-Series expiry is active (documents auto-expire after 30 days) `(Phase 5)`

---

## 4. Frontend (React + Vite + Tailwind)

### 4.1 Scaffold & Layout

- [x] React + Vite scaffold `(NC-08)`
- [x] Install `react-router-dom`, `tailwindcss`, `recharts`, `lucide-react` `(NC-08)`
- [x] Four-page React Router: `/overview`, `/dashboard`, `/chatbot`, `/settings` `(NC-08)`
- [x] Responsive sidebar (`Sidebar.jsx`) + header navbar (`Navbar.jsx`) with Lucide icons `(NC-08)`
- [x] Tailwind design tokens (colors, spacing, typography) `(NC-08)`

### 4.2 Authentication Pages (NC-07)

- [x] Login page with form validation (`Login.jsx`) `(NC-07)`
- [x] Register page (`Register.jsx`) `(NC-07)`
- [x] Auth context: token in localStorage, redirect unauthenticated users `(NC-07)`

### 4.3 Overview Page

- [x] Live Temperature and Humidity cards, polling `/telemetry/latest` every 3s `(CB-01)`
- [x] Motion status indicator card (active/idle) `(CB-02)`
- [x] Gas Level card `(NC-02)`
- [x] Fan toggle switch (POST to `/control/actuator`) `(CB-03)`
- [x] Buzzer toggle, Alert LED toggle (remote actuator controls) `(CB-03)`
- [x] Anomaly list panel with severity color coding `(NC-01)`
- [x] "Delete All" anomalies button `(NC-01)`

### 4.4 Dashboard Page (NC-04)

- [x] Recharts line charts: Temperature, Humidity, Gas Level over time `(NC-04)`
- [x] Time-range presets: 1h, 6h, 24h, 7d `(NC-04)`
- [x] Fetch from `GET /api/v1/telemetry/historical` `(NC-04)`
- [x] CSV export (download chart data) `(NC-04)`
- [x] Refresh button `(NC-04)`
- [ ] Custom date picker for time range `(NC-04)`
- [ ] Chart interactions: zoom, responsive sizing `(NC-04)`
- [ ] Anomaly overlay markers on timeline `(NC-04)`
- [ ] Loading skeletons and error states `(NC-04)`

### 4.5 Chatbot Page (NC-06)

- [x] Chat-style UI with message bubbles (user right, bot left) `(NC-06)`
- [x] Input field + send button; Enter key to submit `(NC-06)`
- [x] Markdown rendering for bot responses `(NC-06)`
- [x] Quick-action pill buttons (`status`, `gas`, `motion`, `temp`, `anomalies`, `help`) `(NC-06)`
- [x] Message history in component state for session `(NC-06)`

### 4.6 Settings Page

- [x] User profile section: display username, email `(Settings)`
- [x] Change password form `(Settings)`
- [x] Email notification toggle (on/off) `(Settings)`
- [x] Editable safety threshold inputs (gasMax, tempMax, tempMin, humidityMax, humidityMin, zScoreLimit) `(Settings)`
- [x] Automatic/Manual mode toggle (Z-Score vs. manual bounds) `(Settings)`
- [x] Disable manual inputs when Automatic mode; disable Z-score input when Manual mode `(Settings)`
- [x] Save thresholds → `PATCH /api/v1/users/profile` `(Settings)`

### 4.7 Internationalization (i18n)

- [x] Translation dictionary: `frontend/src/locales/en.json` `(i18n)`
- [x] Translation provider: `LanguageContext.jsx` with `useTranslation()` hook `(i18n)`
- [x] Vietnamese translation: `frontend/src/locales/vi.json` `(i18n)`
- [ ] Language switcher UI in Navbar or Settings `(i18n)`

### 4.8 Frontend Polish (Phase 5)

- [ ] Consistent styling across all four pages
- [ ] Responsive layout: desktop (1920×1080, 1366×768) and tablet viewports
- [ ] Loading states, error boundaries, and empty-state messages on all pages
- [ ] Smooth route transitions
- [ ] Sensor cards: color-coded severity states (green/yellow/red)
- [ ] Favicon and page title: "SafeboxManager"
- [ ] Connection status indicator (handle API timeouts)

---

## 5. Messaging Infrastructure (EMQX)

- [ ] Create **EMQX Cloud Serverless** free-tier instance `(CB-01)`
- [ ] Note broker URL, port 8883, credentials `(CB-01)`
- [ ] Confirm EMQX free-tier limits are not exceeded during demo `(Phase 5)`

### MQTT Topic Registry

| Topic | Direction | QoS |
|-------|-----------|-----|
| `safebox/{deviceId}/telemetry` | ESP32 → Backend | 0 |
| `safebox/{deviceId}/status` | ESP32 → Backend (LWT) | 1 (retained) |
| `safebox/{deviceId}/control` | Backend → ESP32 | 1 |
| `safebox/{deviceId}/alerts` | ESP32 → Backend | 1 |
| `safebox/{deviceId}/config` | Backend → ESP32 (stretch) | 1 |

---

## 6. Documentation & Testing

### 6.1 Documentation

- [x] Update `README.md` with architecture diagram, setup instructions, env var reference, API summary, hardware pinout
- [ ] Inline code comments on non-obvious logic (anomaly engine, MQTT handler, edge safety)

### 6.2 Integration Tests (TC-01 to TC-06)

- [ ] **TC-01 (WiFi Provisioning)**: Captive portal `Safebox-AP` at `192.168.4.1`, NVS persistence, OLED IP
- [ ] **TC-02 (Telemetry Pipeline)**: 2s ESP32 → EMQX → MongoDB `sensor_readings`
- [ ] **TC-03 (Edge Safety Autonomy)**: Offline gas breach < 200ms, no WiFi needed
- [ ] **TC-04 (Z-Score Engine)**: Temp spike → Z > 3.0 → `anomaly_logs` + frontend alert
- [ ] **TC-05 (Nodemailer)**: Email < 5s on CRITICAL anomaly; 15-min debounce verified
- [ ] **TC-06 (Remote Override)**: Fan toggle on web → relay click < 500ms

### 6.3 Demonstration Preparation

- [ ] Prepare a demo script covering all TC in sequence
- [ ] Ensure hardware stable for 15–20 min live demo
- [ ] Fallback: pre-recorded screen capture of each TC passing

---

## 7. Stretch Goals (if time permits)

| Priority | Item | Description |
|----------|------|-------------|
| 1 | Socket.IO real-time | Live telemetry push (replaces REST polling) |
| 2 | LLM chatbot | Wrap command router with thin LLM layer |
| 3 | Local fan auto-trigger | ESP32 locally triggers fan on temp/gas threshold |
| 4 | Anomaly resolution workflow | Full resolve/acknowledge flow with user attribution |
| 5 | Remote threshold config | `POST /api/v1/config/thresholds` → MQTT `safebox/{deviceId}/config` |
