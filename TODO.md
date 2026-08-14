# SafeRoom IoT Box (Safebox) — Master Task Registry

All tasks from PHASE-1 through PHASE-5 compacted into a single file, classified by system layer.
Use `[x]` for completed items, `[ ]` for pending.

---

## 1. Hardware / ESP32 Firmware

- [x] Correct the 5 V active-buzzer module polarity, preload its safe OFF level at boot, and verify `buzzer=OFF` below the MQ2 threshold on hardware
- [x] Add beginner-friendly comments for every firmware module and function without changing runtime behavior
- [x] Implement the approved basic firmware layout with explicit `main.cpp` orchestration, separate sensors, combined actuators, OLED, WiFi, MQTT, gas safety, and telemetry modules
- [x] Reset `firmware/src` to an empty state before collaboratively redesigning the firmware architecture
- [x] Set the protected `Safebox-AP` password to `12345678`, simplify the WiFiManager implementation for coursework readability, and diagnose live device/MQ2 telemetry connectivity end to end

### 1.1 Sensor Wiring & Reading

- [x] Standardize every firmware sensor reading as an uncalibrated raw snapshot and pass the snapshot object unchanged into telemetry packaging
- [x] Keep the MQ2 raw ADC contract at 12-bit 0–4095, alarm above 600, and hysteresis clear below 500 without presenting the value as calibrated PPM
- [x] Correct MQ2 ADC logic so normal ADC changes are not clamped to a constant 200 PPM; expose raw and relative gas indices honestly
- [x] Simplify MQ2 firmware reading to one direct GPIO 34 ADC sample with no interpolation, median, EMA, or boot calibration
- [x] Simplify the complete ESP32 firmware into one readable main flow with direct hardware I/O while preserving WiFiManager, MQTTS, telemetry, remote control, and offline edge safety
- [x] Split DHT22, PIR, and MQ2 into three independent sensor components while keeping main.cpp as the system orchestrator
- [x] Rename firmware components to sensors and extract OLED, buzzer, relay, LED, website control, MQTT, and WiFiManager into focused modules
- [x] Apply the report-oriented firmware architecture with app orchestration, shared DeviceState, connectivity modules, and separate edge-safety, remote-control, and telemetry features
- [x] Wire **DHT22** to GPIO 4 (pull-up resistor), read temp + humidity every 2 000 ms `(CB-01)`
- [x] Wire **PIR HC-SR501** to GPIO 13 and publish the direct HIGH/LOW digital level without a firmware latch `(CB-02)`
- [x] Wire **MQ2 gas sensor** analog to GPIO 34 (ADC1_CH6), heater to 5V rail `(NC-02)`

### 1.2 Actuator Wiring & Control

- [x] Wire **DC Fan relay** to GPIO 16 (HL-52S active-low: LOW = ON) `(CB-03)`
- [x] Wire **Alert LED (Red)** to GPIO 18 (digital output) `(NC-02)`
- [x] Wire **Status LED (Green)** to GPIO 17 (digital output) `(NC-02)`
- [x] Wire **Active Buzzer module** signal pin to GPIO 19 `(NC-02)`
- [x] Convert Active Buzzer module driver from LEDC tone generation to configurable digital ON/OFF, update wiring docs, and verify the firmware build `(NC-02, TC-03)`
- [x] Wire **SSD1306 OLED** to GPIO 21 (SDA) / GPIO 22 (SCL) via I2C `(NC-02)`
- [ ] Wire a **normally-open hardware reset push button** between EN/RST and GND (no GPIO or firmware dependency)

### 1.3 MQTT Communication

- [x] Connect to EMQX via MQTTS (port 8883, TLS, username/password auth) `(CB-01)`
- [x] Publish JSON telemetry to `safebox/{deviceId}/telemetry` (QoS 0) every 2s `(CB-01)`
- [x] Configure **LWT** on `safebox/{deviceId}/status` with `{"status":"offline"}` (QoS 1, retained) `(CB-01)`
- [x] On connect, publish `{"status":"online"}` to status topic (QoS 0, retained; PubSubClient publish limitation) `(CB-01)`
- [x] Subscribe to `safebox/{deviceId}/control` (QoS 1) for fan commands `(CB-03)`
- [x] On fan control messages, map logical ON/OFF through relay polarity (HL-52S default: ON → GPIO 16 LOW, OFF → HIGH) `(CB-03)`
- [x] Include `actuatorStates.fanOn`, `.buzzerActive`, `.alertLedActive` in telemetry `(CB-03, NC-02)`
- [x] Include `gasLevel` in periodic telemetry payloads `(NC-02)`
- [x] Include `motionDetected` from PIR state in periodic telemetry `(CB-02)`

### 1.4 Edge-Local Safety Logic

- [x] If sampled MQ2 `gasLevel > 600` ADC index → activate Buzzer + Alert LED + OLED warning from the independent high-priority safety task `(NC-02)`
- [x] Report the local gas safety override separately as `gasAlarmActive` in telemetry `(superseded: buzzer/alert-LED web toggles removed; buzzer and LED are edge-only)`
- [x] Auto-turn-off remote buzzer and alert LED after 30 s when no local gas alarm is active, so a lost web OFF command cannot leave them running indefinitely `(superseded: all remote buzzer/LED control removed)`
- [x] Publish edge alert to `safebox/{deviceId}/alerts` (QoS 0; PubSubClient publish limitation) on gas breach `(NC-02)`
- [x] Keep the code-level edge-safety path active during WiFi credential-save and MQTT/TLS calls by isolating MQ2 sampling, buzzer/LED arbitration, and OLED transitions in a priority-4 FreeRTOS task `(TC-03; physical timing still pending)`
- [x] Fix the buzzer module: extend the MQ2 warm-up window to 30 s so the cold-heater ADC spike cannot fire the alarm at boot, publish warm-up gas as `gasValid=false` so no cloud alert fires, and add a 5 s below-600 auto-clear so a baseline inside the 500–600 band cannot leave the buzzer stuck on
- [x] Settle the buzzer driver: the low-trigger module powered at 3.3 V turns fully OFF at the GPIO's 3.3 V HIGH, so wire SIG → GPIO 19 directly, VCC → 3.3 V, GND → GND, and keep `BUZZER_ACTIVE_LOW=true` (5 V supply would need an NPN driver stage with `false`)
- [x] Remove remote buzzer/alert-LED control end to end (web buttons, control API, MQTT control, firmware remote state, backend motion auto-alert LED): buzzer and LED are driven only by the local edge gas alarm (gas > 600), with the OLED warning as the sole local display
- [x] Protect the coursework captive portal with the fixed 8-character WPA2 password `12345678`
- [ ] Verify captive redirect, permanent AP reachability, and runtime router switching on Android/iOS/Windows hardware `(TC-01)`
- [ ] Make per-sensor telemetry validity independent so a DHT checksum failure does not hide healthy MQ2, PIR, or actuator state
- [x] OLED renders the full raw MQ2 GAS warning (>600) and basic provisioning/connection status without presentation-time sensor conversion `(NC-02)`

### 1.5 WiFiManager Provisioning

- [x] Use the standard non-blocking WiFiManager flow: try saved router credentials, then open `Safebox-AP` if connection fails
- [x] Save and apply newly submitted WiFi credentials at runtime, reset the stale MQTT socket, and reconnect transport through the new station network
- [x] Integrate **WiFiManager** Arduino library `(NC-09)`
- [x] On boot: try the saved-NVS station credential, then fall back to `Safebox-AP` `(NC-09)`
- [x] Keep the captive portal at `192.168.4.1` available while router credentials are needed `(NC-09)`
- [x] Save credentials to NVS and switch Station networks without rebooting `(NC-09)`
- [x] Display assigned IP on OLED after WiFi connection `(NC-09)`
- [x] Process SoftAP/captive DNS without blocking the independent MQ2 safety task `(NC-09)`
- [x] Display provisioning AP status or the connected station SSID/IP on OLED `(NC-09)`

### 1.6 Firmware Stability & Polish (Phase 5)

- [x] Reconnect MQTT at a simple fixed interval; continue local safety alerts while disconnected
- [x] Clean up debug `Serial.println` (guard behind debug flag)
- [ ] Validate all 3 sensors (DHT22, PIR, MQ2) reading correctly
- [ ] Validate all 5 actuators (Fan relay, Status LED, Alert LED, Buzzer, OLED) responding
- [x] Preserve the complete sensor and actuator telemetry state through firmware refactors

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
- [x] Auth middleware to protect API routes (`/telemetry/*`, `/control/*`, `/anomalies/*`) `(NC-07)`
- [x] Add regression coverage for protected API prefixes and authenticated CB-03 access `(NC-07, CB-03)`

### 2.3 Telemetry Ingestion & API

- [x] Remove the legacy runtime mock telemetry generator so persisted readings come only from ESP32 MQTT telemetry `(CB-01)`
- [x] `GET /api/v1/telemetry/latest` — returns most recent document for device `(CB-01)`
- [x] `GET /api/v1/telemetry/historical?from=&to=&sensor=` — historical query `(NC-03)`
- [x] Replace mock generator with real MQTT client subscribing to `safebox/+/telemetry` `(CB-01)`
- [x] On MQTT message: validate payload, write to `sensor_readings` via `SensorReading.create()` `(CB-01)`
- [x] Return the newest bounded historical samples in chronological order and add route regression coverage `(NC-03)`

### 2.4 Remote Actuator Control

- [x] `POST /api/v1/control/actuator` — accepts `{deviceId, actuator, state}` `(CB-03)`
- [x] Publish real MQTT command to `safebox/{deviceId}/control` (QoS 1) `(CB-03)`
- [x] Synchronize backend actuator status after successful MQTT commands and confirmed device telemetry `(CB-03)`

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
- [x] `DELETE /api/v1/anomalies/clear-all` — resolve all unresolved anomaly logs (marks `resolved: true`, retains records) `(NC-01)`

### 2.7 Email Notifications (NC-05)

- [x] Email dispatch function with 15-minute sliding window throttle per `(deviceId, sensorType)` `(NC-05)`
- [x] Triggered on `HIGH` or `CRITICAL` severity anomalies only `(NC-05)`
- [x] Replace mock email with real Nodemailer SMTP transport (`nodemailer.createTransport()`) `(NC-05)`
- [x] Configure SMTP sender in `.env`; keep `ALERT_RECIPIENT_EMAIL` as an optional no-user fallback `(NC-05)`
- [x] HTML email template with clear alert formatting `(NC-05)`
- [x] Add integrated coverage for Z-score spike -> fan command -> anomaly log -> email throttle `(NC-01, NC-05)`

### 2.8 Chatbot Command Router (NC-06)

- [x] `POST /api/v1/chatbot/query` — keyword router `(NC-06)`
- [x] Commands: `status`, `gas`, `motion`, `temp`/`temperature`, `humidity`, `anomalies`, `help` `(NC-06)`
- [x] Unrecognized input returns friendly error message `(NC-06)`
- [x] Response format: `{ reply, data, timestamp }` `(NC-06)`
- [x] Remove zero/false sensor fallbacks from chatbot replies when no telemetry exists `(NC-06)`

### 2.9 User Profile API

- [x] `GET /api/v1/users/profile` — return user profile `(Settings)`
- [x] `POST /api/v1/users/profile` — update password and notification preferences `(Settings)`

### 2.10 Backend Hardening (Phase 5)

- [ ] Input validation on all API endpoints (reject malformed requests with proper error codes)
- [ ] Error handling middleware (catch-all, return JSON `{ success, data, error }`)
- [ ] Environment variable validation on startup (fail fast if required vars missing)
- [ ] API response consistency: standard envelope format
- [x] Handle MQTT broker disconnect/reconnect gracefully
- [x] Remove vestigial `lightIntensity` schema field, telemetry route entry, and validation block (LDR hardware removed)
- [x] Delete stray root `package.json`/`package-lock.json` (unused `mongodb ^7.5.0`, no scripts)
- [x] Remove duplicate `.agents/AGENTS.md` (root `AGENTS.md` is authoritative)
- [x] Map client validation errors (TypeError / RangeError) to HTTP 400 status in POST /api/v1/control/thresholds (M1)
- [x] Connect UserSchema.settings.thresholds subdocument with anomalyEngine threshold persistence and load (M3)
- [x] Map client validation errors (TypeError / RangeError) to HTTP 400 status in POST /api/v1/users/profile to match the control thresholds route (N1)
- [x] Persist settings.thresholds exactly once on POST /api/v1/users/profile (N5)
- [x] Trim ACTUATOR_STATE_FIELDS to the remotely controllable fan actuator only (N6)

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
- [x] Motion status indicator card (active/idle) `(CB-02)` — the card highlights green while motion is detected (display-only; it does NOT drive any physical LED)
- [x] Gas Level card `(NC-02)`
- [x] Fan toggle switch (POST to `/control/actuator`) `(CB-03)`
- [x] Buzzer toggle, Alert LED toggle (remote actuator controls) (superseded: remote buzzer/alert-LED control removed end-to-end; buzzer and LED are edge-only) `(CB-03)`
- [x] Anomaly list panel with severity color coding `(NC-01)`
- [x] "Resolve All" anomalies button that preserves the anomaly audit trail `(NC-01)`
- [x] Replace zero-valued telemetry fallbacks with an explicit no-data state `(CB-01)`

### 4.4 Dashboard Page (NC-04)

- [x] Recharts line charts: Temperature, Humidity, Gas Level over time `(NC-04)`
- [x] Make time-range presets 1h, 6h, 24h, 7d send matching `from`/`to` query parameters `(NC-04)`
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
- [x] Automatic mode toggle adds Z-Score evaluation while hard safety bounds remain active in both modes `(Settings)`
- [x] Keep hard-bound inputs enabled in both modes; disable only the Z-score input when Automatic mode is off `(Settings)`
- [x] Save thresholds → `POST /api/v1/control/thresholds` `(Settings)`

### 4.7 Internationalization (i18n)

- [ ] Translation dictionary: `frontend/src/locales/en.json` `(i18n)`
- [ ] Translation provider: `LanguageContext.jsx` with `useTranslation()` hook `(i18n)`
- [ ] Vietnamese translation: `frontend/src/locales/vi.json` `(i18n)`
- [ ] Language switcher UI in Navbar or Settings `(i18n)`

### 4.8 Frontend Polish (Phase 5)

- [ ] Consistent styling across all four pages
- [ ] Responsive layout: desktop (1920×1080, 1366×768) and tablet viewports
- [ ] Loading states, error boundaries, and empty-state messages on all pages
- [ ] Smooth route transitions
- [ ] Sensor cards: color-coded severity states (green/yellow/red)
- [ ] Favicon and page title: "SafeboxManager"
- [ ] Connection status indicator (handle API timeouts)
- [ ] Upgrade Vite/esbuild and React Router to clear current `npm audit` advisories, with migration regression testing
- [x] Replace fake placeholder fallbacks (`'admin'`, `'admin@safebox.io'`) with empty strings in Settings profile fields
- [x] Derive Navbar device badge from user context instead of hardcoding `safebox-01`

---

## 5. Messaging Infrastructure (EMQX)

- [x] Create **EMQX Cloud Serverless** free-tier instance `(CB-01)`
- [x] Note broker URL, port 8883, credentials `(CB-01)`
- [x] Configure backend and firmware MQTTS clients with the EMQX Serverless host, identity, and TLS CA `(CB-01)`
- [x] Rotate the exposed MQTT password, update both local secret files, and verify broker authentication `(CB-01)`
- [x] Fix MQTT.js multi-topic subscription shape and add a regression test for real broker startup `(CB-01)`
- [x] Restore the downloaded EMQX credentials to both ignored local config files and verify real TLS/MQTT authentication `(CB-01)`
- [x] Gate ESP32 MQTTS on verified NTP time and expose actionable TLS connection diagnostics `(CB-01)`
- [ ] Confirm EMQX free-tier limits are not exceeded during demo `(Phase 5)`

### MQTT Topic Registry

| Topic | Direction | QoS |
|-------|-----------|-----|
| `safebox/{deviceId}/telemetry` | ESP32 → Backend | 0 |
| `safebox/{deviceId}/status` | ESP32 → Backend | online QoS 0 retained; offline LWT QoS 1 retained |
| `safebox/{deviceId}/control` | Backend → ESP32 | 1 |
| `safebox/{deviceId}/alerts` | ESP32 → Backend | 0 |
| `safebox/{deviceId}/config` | Backend → ESP32 (stretch) | 1 |

---

## 6. Documentation & Testing

- [x] Clean generated/obsolete folders, resolve the interrupted merge consistently, and audit the complete project against `project_description.pdf` in `EVALUATE.md`

### 6.1 Documentation

- [x] Add maintainable module/function/decision comments across firmware, backend, and frontend source code for code walkthrough and viva preparation
- [x] Document the runtime WiFi switching flow, raw sensor payload contract, and MQ2 raw ADC warning bands in `README.md` and firmware documentation
- [x] Update `README.md` with architecture diagram, setup instructions, env var reference, API summary, hardware pinout
- [x] Add step-by-step MongoDB Atlas + EMQX Cloud connection guide to `FIRMWARE_INSTRUCTION.md`
- [x] Remove obsolete LDR hardware and wiring references from `FIRMWARE_INSTRUCTION.md`
- [x] Document the external EN/RST hardware reset button in `FIRMWARE_INSTRUCTION.md` and `README.md`
- [x] Inline code comments on non-obvious logic (anomaly engine, MQTT handler, edge safety)
- [x] Update AUDIT.md to reflect current codebase findings and resolved items
- [x] Fix the stale actuator list on the POST /api/v1/control/actuator row in the README.md REST API table (N2)
- [x] Mark the TODO §4.3 buzzer/LED web toggle item as superseded to match the fan-only UI (N3)

### 6.2 Integration Tests (TC-01 to TC-06)

- [ ] **TC-01 (WiFi Provisioning)**: Captive portal `Safebox-AP` at `192.168.4.1`, NVS persistence, OLED IP
- [ ] **TC-02 (Telemetry Pipeline)**: save reproducible live evidence of 2s ESP32 → EMQX → MongoDB `sensor_readings`
- [ ] **TC-03 (Edge Safety Autonomy)**: Offline gas breach < 200ms, no WiFi needed
- [ ] **TC-04 (Z-Score Engine)**: Temp spike → Z > 3.0 → `anomaly_logs` + frontend alert
- [ ] **TC-05 (Nodemailer)**: Email < 5s on CRITICAL anomaly; 15-min debounce verified
- [ ] **TC-06 (Remote Override)**: Fan toggle on web → relay click < 500ms
- [x] Add software regression coverage and firmware build verification for the direct MQ2 ADC contract and invalid-sample false-alert suppression

### 6.3 Demonstration Preparation

- [ ] Prepare a demo script covering all TC in sequence
- [ ] Ensure hardware stable for 15–20 min live demo
- [ ] Fallback: pre-recorded screen capture of each TC passing

### 6.4 Thai Kiet Viva Preparation

- [x] Create a responsibility and code map for CB-03, NC-01, NC-03, and NC-05
- [x] Create detailed code walkthrough, viva Q&A, and repeatable demo guides for Thai Kiet's scope
- [x] Simplify non-obvious actuator-state and anomaly-engine code without changing system contracts
- [x] Re-run backend tests, CB-03 simulation, frontend build, and firmware build after the viva-focused refactor
- [x] Refresh Thai Kiet viva documentation for the modular firmware architecture pulled on 2026-08-13
- [x] Merge the Thai Kiet viva, Q&A, code walkthrough, and demo guides into one polished, verified LaTeX/PDF handbook

### 6.5 User-Managed Email Alerts

- [x] Use each account's profile email for alerts and persist the email-enabled preference from Settings
- [x] Resolve enabled user recipients from MongoDB when sending HIGH/CRITICAL anomaly emails
- [x] Keep `ALERT_RECIPIENT_EMAIL` as an optional development fallback and test recipient selection
- [x] Re-run backend tests and frontend production build after the email settings integration
- [x] Display alert email timestamps in Vietnam time (UTC+7) while retaining UTC in storage

---

## 7. Stretch Goals (if time permits)

| Priority | Item | Description |
|----------|------|-------------|
| 1 | Socket.IO real-time | Live telemetry push (replaces REST polling) |
| 2 | LLM chatbot | Wrap command router with thin LLM layer |
| 3 | Local fan auto-trigger | ESP32 locally triggers fan on temp/gas threshold |
| 4 | Anomaly resolution workflow | Full resolve/acknowledge flow with user attribution |
| 5 | Remote threshold config | `POST /api/v1/config/thresholds` → MQTT `safebox/{deviceId}/config` |
