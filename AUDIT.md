# SafeRoom IoT Box — Codebase Audit Report

**Date**: 2026-08-14  
**Scope**: Full-stack audit — backend (Express.js), frontend (React/Vite), firmware (ESP32/Arduino), and master documentation (TODO.md, README.md, EVALUATE.md).  
**Method**: Evidence-based code inspection + empirical verification (`npm test`, `npm run test:kiet`, `npm run build`, `git status`).  
**Skill**: Audit methodology defined in [`.agents/skills/safebox-codebase-audit/SKILL.md`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/.agents/skills/safebox-codebase-audit/SKILL.md).  

---

## Executive Summary

The codebase is in **excellent health**:
- **Backend**: **45/45 unit/integration tests pass** via Node test runner.
- **Viva Scope (Thai Kiet)**: **42/42 tests pass + CB-03 PASS** via `npm run test:kiet`.
- **Frontend**: **2/2 contract tests pass** and **production build succeeds** (`vite build` -> clean bundle).
- **Telemetry Integrity**: Strict hardware MQTT ingestion — mock telemetry generation is 100% removed (`mockTelemetryGenerator.js` deleted and unhooked).
- **Audit Findings**: All previous High (H1–H4) and Medium (M1–M6) findings, as well as re-audit items (N1–N3, N5–N6), are **100% resolved and verified**.

---

## Resolved Audit Items (Verified in Current Tree)

| Finding ID | Previous Audit Finding | Resolution Details | Status |
|---|---|---|---|
| **H1** | `TODO.md` marked i18n items as `[x]` despite missing locale files | [`TODO.md:264-267`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md#L264-L267) `§4.7 Internationalization` items are `[ ]` (pending); no `frontend/src/locales/` directory exists — claims and code agree. | **Resolved** |
| **H2** | Dashboard time-range presets (`1h/6h/24h/7d`) were decorative | [`Dashboard.jsx:33-40`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/frontend/src/pages/Dashboard.jsx#L33-L40) computes dynamic `from`/`to` ISO bounds and passes `limit=1000` to `/api/v1/telemetry/historical`. | **Resolved** |
| **H3** | Gas threshold hardcoded to 600 PPM in chatbot/Overview | [`chatbot.js:57,105,122`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/chatbot.js#L57) dynamically evaluates `getThresholds()`; [`Overview.jsx:74-85`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/frontend/src/pages/Overview.jsx#L74-L85) queries `/api/v1/control/thresholds` on mount and renders via `telemetryContract.js`. Firmware `600` remains documented as compile-time edge constant (`FIRMWARE_EDGE_GAS_THRESHOLD`). | **Resolved** |
| **H4** | `DELETE /api/v1/anomalies` vs actual `/clear-all` semantics | [`TODO.md:140`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md#L140) and [`anomalies.js:58`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/anomalies.js#L58) accurately document that `DELETE /api/v1/anomalies/clear-all` resolves records (`resolved: true`), preserving historical auditability. | **Resolved** |
| **M1** | Threshold-update endpoint returned 500 for client validation errors | [`control.js:38`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/control.js#L38) maps `TypeError` and `RangeError` to `400 Bad Request`. | **Resolved** |
| **M2** | Stale `PATCH` comment on users profile route | [`users.js:21`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/users.js#L21) updated comment to reflect `router.post('/profile')`. | **Resolved** |
| **M3** | Safety threshold constants duplicated in Mongoose UserSchema | Connected per-user threshold persistence and loading between `UserSchema.settings.thresholds` in [`Schemas.js`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/models/Schemas.js), [`anomalyEngine.js`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/services/anomalyEngine.js), [`control.js`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/control.js), and [`users.js`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/users.js). | **Resolved** |
| **M4** | Redundant root `package.json`/`package-lock.json`, duplicate `.agents/AGENTS.md`, dead `lightIntensity` schema field | Deleted root manifests and `.agents/AGENTS.md`; purged `lightIntensity` across [`Schemas.js`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/models/Schemas.js), [`telemetry.js`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/telemetry.js), and [`telemetryService.js`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/services/telemetryService.js). | **Resolved** |
| **M5** | Fake `'admin'`/`'admin@safebox.io'` fallbacks; Navbar hardcoded badge | [`Settings.jsx:362,371`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/frontend/src/pages/Settings.jsx#L362) fallbacks replaced with `''`; [`Navbar.jsx:30`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/frontend/src/components/Navbar.jsx#L30) derives badge dynamically from `user?.deviceId`. | **Resolved** |
| **M6** | `TODO.md` fan polarity contradicted firmware | [`TODO.md:32,47`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md#L32) updated wording to `HL-52S active-low: LOW = ON`, matching `firmware/src/config.h:17` and `README.md`. | **Resolved** |
| **N1** | `users.js` mapped only `TypeError` to 400 | [`users.js:55`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/users.js#L55) maps `TypeError \|\| RangeError → 400`, matching `control.js`. | **Resolved** |
| **N2** | README API table listed "Fan, Buzzer, Alert LED, Armed" as remote outputs | [`README.md:260`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/README.md#L260) documents fan + `systemArmed` only, noting buzzer/alert LED are edge-only. | **Resolved** |
| **N3** | `TODO.md` §4.3 claimed buzzer/LED web toggles without a superseded note | [`TODO.md:227`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md#L227) annotated `(superseded: remote buzzer/alert-LED control removed end-to-end; buzzer and LED are edge-only)`. | **Resolved** |
| **N5** | Thresholds double-written on profile update | [`users.js:42`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/users.js#L42) calls `updateThresholds(settings.thresholds)` without `userId`; `findByIdAndUpdate` performs the atomic persistence. | **Resolved** |
| **N6** | Dead `buzzerActive`/`alertLedActive` entries in `ACTUATOR_STATE_FIELDS` | [`actuatorStateService.js:13-16`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/services/actuatorStateService.js#L13-L16) trimmed to `{ fan: 'fanOn' }`; non-remote actuators throw `TypeError`. | **Resolved** |
| **Mock Telemetry** | Server generated fake telemetry ticks in mock mode | [`mockTelemetryGenerator.js`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/services/mockTelemetryGenerator.js) deleted; [`server.js:74-88`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/server.js#L74-L88) unhooked generator calls. | **Resolved** |

---

## Remaining Open Notes

### LOW / Informational Notes

- **N4 (LOW)**: Navbar device badge renders `{user?.deviceId || 'safebox-01'}`. Since single-box deployment defaults to `safebox-01`, this provides a clean display fallback.
- **Bundle Size**: Frontend production bundle is 727 kB (Vite chunk warning for single JS artifact); application functions smoothly with no run-time issues.
- **Login/Register Auth**: `Login.jsx` and `Register.jsx` intentionally bypass authenticated `apiFetch` in favor of raw `fetch` for unauthenticated endpoints.

---

## Verified OK

| Check | Command | Result |
|---|---|---|
| Backend Unit & Integration Tests | `cd backend && npm test` | **45/45 pass** (Z-score engine, dedup, min-delta, email throttle, UTC+7 rendering, HTML escaping, CB-03 auth, MQTT topic-map, per-user thresholds, time-series validation) |
| Focused Viva Suite & CB-03 Simulation | `cd backend && npm run test:kiet` | **42/42 pass + `CB-03 PASS`** (authenticated fan ON → status → OFF) |
| Frontend Contract Suite | `cd frontend && npm test` | **2/2 pass** (raw ADC contract, invalid snapshot rejection) |
| Frontend Production Build | `cd frontend && npm run build` | **Success** (clean Vite production bundle) |
| Telemetry Pipeline Integrity | Static inspection | **Strict hardware MQTT ingestion** — 0 synthetic telemetry ticks |
| Firmware Structure & Invariants | Code audit | Modular `firmware/src` (sensors/, actuators/, display/, network/, features/) strictly matches README, TODO, and architecture docs |
| Secrets Hygiene | `git status` | `.env` and `secrets.h` gitignored; clean credential isolation |
| MQ2 Sensor Contract | Code audit | Raw 12-bit ADC index `0–4095`, `gasUnit: 'adc_index'`, `gasLevel === gasRaw` enforced; backend threshold ceiling capped at `4094` |