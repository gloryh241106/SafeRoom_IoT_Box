# Phase 4 — Chatbot, Z-Score Finalization & Settings Page (Weeks 4–5)

## Goal

Build the **rule-based chatbot**, finalize and harden the **Z-score anomaly engine**, implement the **Settings page** (user profile, notification preferences, threshold configuration), and complete all remaining feature scope.

---

## Owner Assignments

| Owner | Task ID | Deliverable |
|-------|---------|-------------|
| **Khang** | NC-06 | Rule-based chatbot |
| **Kiệt** | NC-01 (finish) | Z-score engine finalization & stress testing |
| **Hoàng** | — | Settings page (profile, notifications, thresholds) |

---

## Deliverables

### 1. NC-06 — Rule-Based Chatbot (Khang)

**Backend**
- [ ] Expose `POST /api/v1/chatbot/query`:
  ```json
  { "message": "status" }
  ```
- [ ] Implement keyword/command router (conditional logic, no LLM):

  | Command | Response |
  |---------|----------|
  | `status` | Latest telemetry + all actuator states for the device |
  | `gas` | Latest `gasLevel` value + last gas anomaly (if any) with timestamp |
  | `motion` | Latest PIR state + timestamp of last motion event |
  | `temperature` / `temp` | Latest temperature + recent anomalies |
  | `humidity` | Latest humidity reading |
  | `anomalies` | Count and list of unresolved anomalies |
  | `help` | List of all supported commands with descriptions |
  | *(unrecognized)* | Friendly error: "I didn't understand that. Type `help` for available commands." |

- [ ] Response format:
  ```json
  {
    "reply": "Current temperature: 28.5°C | Humidity: 65.2% | Gas: 120 PPM | ...",
    "data": { ... },
    "timestamp": "2026-07-15T10:30:00Z"
  }
  ```

**Frontend — Chatbot Page**
- [ ] Chat-style UI with message bubbles (user messages right-aligned, bot responses left-aligned).
- [ ] Input field with send button; support Enter key to submit.
- [ ] Display bot responses with formatted data (sensor values, anomaly details).
- [ ] Message history maintained in component state for the session.
- [ ] Quick-action buttons for common commands (`status`, `gas`, `motion`, `help`).

### 2. NC-01 — Z-Score Engine Finalization (Kiệt, finish)

**Backend**
- [ ] Validate Z-score calculations with controlled test data:
  - Inject 30 stable readings → inject spike → confirm anomaly fires.
  - Confirm `Δ_min_sense` filter prevents anomalies from micro-fluctuations.
- [ ] Verify all rule matrix interactions:
  - Gas CRITICAL → email + anomaly log ✓
  - Temp HIGH → fan ON + anomaly log ✓
  - Motion + Armed → email + alert LED/buzzer ✓
  - Humidity MEDIUM → anomaly log only ✓
- [ ] Edge case handling:
  - Fewer than 30 samples (cold start): skip Z-score, rely on hard thresholds only.
  - σ = 0 (all identical readings): treat as no anomaly.
  - Rapid repeated anomalies: ensure deduplication within a reasonable window.
- [ ] Backend subscribes to `safebox/+/alerts` (edge alerts from ESP32):
  - On edge alert: create `anomaly_logs` entry with `triggerType: 'EDGE_SAFETY_TRIGGER'`.

**Frontend — Overview Page**
- [ ] Anomaly alert badge/notification on Overview page.
- [ ] Anomaly list panel showing unresolved anomalies with severity color coding.
- [ ] Ability to mark anomalies as resolved (optional: `PATCH /api/v1/anomalies/:id/resolve`).

### 3. Settings Page (Hoàng)

**Frontend — Settings Page**
- [ ] **User Profile** section:
  - Display username and email.
  - Change password form.
- [ ] **Email Notification Preferences**:
  - Toggle email alerts on/off.
  - Configure which severity levels trigger emails (HIGH, CRITICAL).
- [ ] **Threshold Configuration Display**:
  - Show current authoritative thresholds (from rule matrix):
    - Gas: 600 PPM
    - Temperature: 45°C
    - Z-score threshold: 3.0
  - **Note**: Per RESOLUTION.md §B, the wireframe mock values (20–35°C, 400 ppm) are placeholders — display the actual authoritative values from the rule matrix.
- [ ] Remote threshold update via `safebox/{deviceId}/config` topic (optional stretch):
  ```json
  { "thresholds": { "gasLevel": 600, "temperature": 45, "zScoreThreshold": 3.0 } }
  ```

**Backend**
- [ ] `GET /api/v1/users/profile` — return user profile.
- [ ] `PATCH /api/v1/users/profile` — update password, notification preferences.
- [ ] Optionally: `POST /api/v1/config/thresholds` → publish to MQTT config topic.

---

## New MQTT Topics in This Phase

| Topic | Direction | QoS |
|-------|-----------|-----|
| `safebox/{deviceId}/config` | Backend → ESP32 | 1 |

---

## API Endpoints Added in This Phase

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/chatbot/query` | Chatbot command query |
| GET | `/api/v1/users/profile` | Get user profile |
| PATCH | `/api/v1/users/profile` | Update user profile/preferences |
| PATCH | `/api/v1/anomalies/:id/resolve` | Mark anomaly as resolved (optional) |

---

## Verification Checklist

- [ ] **V4-01**: Chatbot `status` command returns current telemetry and actuator states.
- [ ] **V4-02**: Chatbot `gas` command returns gas level and last gas anomaly.
- [ ] **V4-03**: Chatbot `help` command returns all supported commands.
- [ ] **V4-04**: Unrecognized chatbot input returns a friendly error message.
- [ ] **V4-05**: Z-score anomaly fires correctly after 30+ baseline samples followed by a spike (TC-04).
- [ ] **V4-06**: Cold-start case (< 30 samples) gracefully skips Z-score without errors.
- [ ] **V4-07**: Edge alert from ESP32 creates `EDGE_SAFETY_TRIGGER` anomaly log entry.
- [ ] **V4-08**: Settings page displays correct authoritative threshold values (not wireframe mock values).
- [ ] **V4-09**: User can update password and notification preferences from Settings page.
- [ ] **V4-10**: Anomaly alert badge appears on Overview page when unresolved anomalies exist.

---

## Exit Criteria

Phase 4 is **complete** when:
1. Chatbot responds correctly to all defined commands.
2. Z-score engine is tested and handles edge cases gracefully.
3. Settings page is functional with profile management and notification preferences.
4. All anomaly types (Z-score, hard threshold, edge safety) create correct log entries.
5. All API endpoints return expected responses.
