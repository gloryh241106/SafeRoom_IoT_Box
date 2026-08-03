# Phase 5 — Integration Testing, Polish & Demonstration (Week 5, final)

## Goal

**Freeze features**, run the full **verification test suite** (TC-01 through TC-06), fix bugs, polish UI/UX, and prepare the system for **demonstration and grading**.

---

## Owner Assignments

All three team members collaborate on integration testing and polish.

| Owner | Focus Area |
|-------|------------|
| **Hoàng** | Firmware stability, hardware wiring validation, WiFiManager edge cases |
| **Khang** | Frontend polish, responsive design, UX review, documentation |
| **Kiệt** | Backend stability, anomaly engine edge cases, email throttling, API review |

---

## Deliverables

### 1. Full System Integration Test Suite

Execute all test cases from MERGED.md §11:

| Test Case | Procedure | Expected Result | Pass Criteria |
|-----------|-----------|-----------------|---------------|
| **TC-01: WiFi Provisioning** | Power device without saved WiFi; connect to `Safebox-AP` SoftAP portal. | Captive portal opens, saves credentials to NVS, reboots into Station Mode. | IP address displayed on SSD1306 OLED. |
| **TC-02: Telemetry Pipeline** | Observe sensor telemetry on ESP32 serial monitor and MongoDB Atlas. | Telemetry published every 2s to EMQX, ingested into `sensor_readings`. | Records present in MongoDB with accurate timestamps. |
| **TC-03: Edge Safety Autonomy** | Apply smoke/lighter gas to MQ2 sensor with WiFi router powered off. | ESP32 detects gas breach locally and triggers Buzzer/LEDs immediately. | Actuators (excluding Fan) respond within < 200 ms without cloud connection. |
| **TC-04: Z-Score Engine** | Apply sudden temperature spike (heat gun/hairdryer) near DHT22. | Backend Z-score exceeds 3.0, creates entry in `anomaly_logs`, pushes alert to UI. | Anomaly logged; Dashboard UI shows alert badge. |
| **TC-05: Nodemailer** | Trigger CRITICAL gas anomaly. | Backend sends email alert via Nodemailer to user address. | Email received in inbox within < 5 seconds; debounced on repeat triggers. |
| **TC-06: Remote Override** | Toggle DC Fan switch on SafeboxManager Overview web page. | Frontend sends HTTP → Backend publishes MQTT → ESP32 toggles Relay. | Relay clicks and Fan updates state within < 500 ms. |

### 2. Bug Fixes & Edge Cases

- [ ] Fix any failing test cases from the integration test suite.
- [ ] Handle network disconnection/reconnection gracefully:
  - ESP32: reconnect MQTT with exponential backoff; continue local safety alerts.
  - Backend: handle MQTT broker disconnect/reconnect.
  - Frontend: show connection status indicator; handle API timeouts.
- [ ] Validate MongoDB TTL index is active (documents auto-expire after 30 days).
- [ ] Confirm EMQX Cloud free-tier limits are not exceeded during demo.

### 3. Frontend Polish

- [ ] Consistent styling across all four pages (Overview, Dashboard, Chatbot, Settings).
- [ ] Responsive layout: test on desktop (1920×1080, 1366×768) and tablet viewports.
- [ ] Loading states, error boundaries, and empty-state messages on all pages.
- [ ] Smooth transitions between routes.
- [ ] Sensor cards on Overview page: color-coded severity states (green/yellow/red).
- [ ] Favicon and page title: "SafeboxManager".

### 4. Backend Hardening

- [ ] Input validation on all API endpoints (reject malformed requests with proper error codes).
- [ ] Error handling middleware (catch-all for unhandled errors, return JSON error responses).
- [ ] Environment variable validation on startup (fail fast if required vars are missing).
- [ ] API response consistency: standard envelope format `{ success, data, error }`.

### 5. Documentation

- [ ] Update `README.md` with:
  - Project description and architecture diagram.
  - Setup instructions (backend, frontend, ESP32 firmware).
  - Environment variable reference.
  - API endpoint summary.
  - Hardware wiring reference (pin table from MERGED.md §6).
- [ ] Inline code comments on non-obvious logic (anomaly engine, MQTT handler, edge safety).

---

## Stretch Goals (if time permits)

These items from RESOLUTION.md are explicitly **out of scope** for grading, but are worthwhile if the core test suite passes early:

| Priority | Item | Description |
|----------|------|-------------|
| 1 | Socket.IO real-time | Add Socket.IO layer for live telemetry push (replaces polling) |
| 2 | LLM chatbot | Wrap existing command router with a thin LLM layer for natural language |
| 3 | Local fan auto-trigger | ESP32 locally triggers fan on temperature/gas threshold without backend |
| 4 | Anomaly resolution workflow | Full resolve/acknowledge flow with user attribution |

---

## Demonstration Preparation

- [ ] Prepare a **demo script** covering all test cases in sequence.
- [ ] Ensure hardware is stable for a 15–20 minute live demo.
- [ ] Have a **fallback**: pre-recorded screen capture of each TC passing in case of hardware flakiness.
- [ ] Clean up any debug `console.log` / `Serial.println` statements (or guard them behind a debug flag).

---

## Final System Checklist

### ESP32 Firmware
- [ ] All 4 sensors (DHT22, PIR, MQ2, LDR) reading correctly.
- [ ] All 5 actuators (Fan relay, Status LED, Alert LED, Buzzer, OLED) responding.
- [ ] MQTT telemetry publishing every 2s.
- [ ] Edge-local gas safety alert works without WiFi.
- [ ] WiFiManager provisioning works.
- [ ] LWT online/offline status works.

### Backend
- [ ] All API endpoints functional and authenticated.
- [ ] MQTT subscription and telemetry ingestion working.
- [ ] Anomaly engine (Z-score + hard thresholds) firing correctly.
- [ ] Email notifications dispatching with throttle.
- [ ] Chatbot command router responding to all commands.

### Frontend
- [ ] Overview: live telemetry cards, actuator controls, anomaly badges.
- [ ] Dashboard: historical charts with time-range selection, CSV export.
- [ ] Chatbot: command input, formatted responses, quick-action buttons.
- [ ] Settings: profile management, notification preferences, threshold display.
- [ ] Auth: login/register flow, protected routes.

### Infrastructure
- [ ] MongoDB Atlas: `sensor_readings`, `anomaly_logs`, `users` collections operational.
- [ ] EMQX Cloud: broker accessible, TLS enforced, credentials configured.
- [ ] All `.env` variables documented and set correctly.

---

## Exit Criteria

Phase 5 (and the project) is **complete** when:
1. All six test cases (TC-01 through TC-06) pass.
2. No critical bugs remain in the core feature set.
3. Frontend is polished and responsive.
4. README.md provides clear setup and usage instructions.
5. System is demo-ready for grading.
