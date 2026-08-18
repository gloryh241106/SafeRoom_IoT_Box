# SafeRoom IoT Box — Codebase Audit Report

**Date**: 2026-08-18  
**Scope**: Full-stack audit — backend (Express.js), frontend (React/Vite), firmware (ESP32/Arduino), and master documentation (TODO.md, README.md, FIRMWARE_INSTRUCTION.md, REPORT.md, AGENTS.md).  
**Method**: Evidence-based code inspection + empirical verification (`npm test`, `npm run test:kiet`, frontend `npm test`, `npm run build`, `git status`).  
**Skill**: Audit methodology defined in [`.agents/skills/safebox-codebase-audit/SKILL.md`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/.agents/skills/safebox-codebase-audit/SKILL.md).  

---

## Executive Summary

The codebase is in **excellent health**:
- **Backend**: **56/56 tests pass** (`npm test`).
- **Viva suite**: **46/46 + `CB-03 PASS`** (`npm run test:kiet`).
- **Frontend**: **2/2 contract tests pass**; `vite build` succeeds (5.65 s, chunk-size warning only).
- **Working tree clean**; `.env` / `secrets.h` gitignored.
- All previous findings (H1–H4, M1–M6, N1–N3, N5–N6) remain resolved in the current tree.

New work since the last audit (`a3b01cf`, `0401362`, `92629a8`, `f047434`) is well implemented and tested: async backend→firmware gas threshold sync (config.h rewrite + retained MQTT `safebox/{deviceId}/config` push), the DISARMED gate (backend 403 + anomaly pause + frontend freeze), status LED (GPIO 17) removal, and NTP-gated MQTTS startup all verified end-to-end with regression coverage.

**Remaining issues are documentation drift around the gas threshold default and one default-value mismatch between layers.**

---

## Resolved Audit Items (Verified in Current Tree)

| Finding ID | Previous Audit Finding | Resolution Details | Status |
|---|---|---|---|
| **H1** | `TODO.md` marked i18n items as `[x]` despite missing locale files | [`TODO.md:269-272`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md#L269-L272) `§4.7 Internationalization` items are `[ ]` (pending); no `frontend/src/locales/` directory exists. | **Resolved** |
| **H2** | Dashboard time-range presets were decorative | [`Dashboard.jsx:33-40`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/frontend/src/pages/Dashboard.jsx#L33-L40) computes dynamic `from`/`to` ISO bounds and passes `limit=1000` to `/api/v1/telemetry/historical`. | **Resolved** |
| **H3** | Gas threshold hardcoded to 600 in chatbot/Overview | `chatbot.js` evaluates `getThresholds()` dynamically; `Overview.jsx`/`Settings.jsx` load `/api/v1/control/thresholds` and display `firmwareGasEdgeThreshold`. | **Resolved** |
| **H4** | `DELETE /api/v1/anomalies` vs actual `/clear-all` semantics | [`anomalies.js:59`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/anomalies.js#L59) resolves records; comment documents the legacy name. | **Resolved** |
| **M1** | Threshold-update endpoint returned 500 for client validation errors | [`control.js:82`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/control.js#L82) maps `TypeError`/`RangeError` → 400. | **Resolved** |
| **M2** | Stale `PATCH` comment on users profile route | [`users.js:22`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/users.js#L22) documents the POST contract. | **Resolved** |
| **M3** | Threshold constants duplicated in Mongoose UserSchema | Centralized in `sensorContract.js` / `telemetryContract.js`; wired through `anomalyEngine.js` and both routes. | **Resolved** |
| **M4** | Redundant root manifests, duplicate `.agents/AGENTS.md`, dead `lightIntensity` field | All deleted/removed; root `package.json`/`package-lock.json` absent. | **Resolved** |
| **M5** | Fake `'admin'`/`'admin@safebox.io'` fallbacks | `Settings.jsx` uses `''` fallbacks; Navbar badge comment explains the `safebox-01` label. | **Resolved** |
| **M6** | `TODO.md` fan polarity contradicted firmware | [`TODO.md:32`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md#L32) matches `config.h:16`. | **Resolved** |
| **N1** | `users.js` mapped only `TypeError` to 400 | [`users.js:55`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/users.js#L55) maps `TypeError \|\| RangeError → 400`. | **Resolved** |
| **N2** | README API table listed "Fan, Buzzer, Alert LED, Armed" | [`README.md:259`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/README.md#L259) documents fan + `systemArmed` only, incl. the DISARMED 403. | **Resolved** |
| **N3** | `TODO.md` §4.3 claimed buzzer/LED web toggles without superseded note | [`TODO.md:231`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md#L231) annotated as superseded. | **Resolved** |
| **N5** | Thresholds double-written on profile update | [`users.js:42-46`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/users.js#L42-L46) — single persistence via `findByIdAndUpdate`. | **Resolved** |
| **N6** | Dead `buzzerActive`/`alertLedActive` entries in `ACTUATOR_STATE_FIELDS` | [`actuatorStateService.js:13-16`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/services/actuatorStateService.js#L13-L16) — `{ fan: 'fanOn' }` only; non-remote actuators throw. | **Resolved** |

---

## New Findings (2026-08-18)

### MEDIUM

- **M7 — Default gas threshold mismatch: backend 600 vs firmware 3000, and the first Settings save silently rewrites the edge threshold**  
  Backend/UI defaults are `DEFAULT_GAS_ALERT_THRESHOLD = 600` ([`sensorContract.js:12`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/config/sensorContract.js#L12), `UserSchema.gasMax` default, [`telemetryContract.js:18`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/frontend/src/telemetryContract.js#L18), Settings initial form state), while the flashed-firmware default is `GAS_ALARM_THRESHOLD_RAW = 3000` / clear `2900` ([`config.h:44-45`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/firmware/src/config.h#L44-L45)). Because `POST /api/v1/control/thresholds` rewrites `config.h` and pushes the value live with **any** settings save ([`control.js:62-68`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/routes/control.js#L62-L68)), a user saving even an unrelated `tempMax` change silently drops the ESP32 edge alarm from 3000 to 600 — if clean-air ADC reads above 600 (the likely reason the default was raised), the buzzer will false-alarm immediately after the first save. *Fix: align the defaults (raise `DEFAULT_GAS_ALERT_THRESHOLD`/`telemetryContract`/`UserSchema` to the config.h default or lower config.h), or persist gasMax independently so unrelated saves do not rewrite the edge threshold.*
- **M8 — Documentation still claims threshold defaults `1200`/`1100`; `config.h` now has `3000`/`2900`**  
  [`README.md:175,177,208`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/README.md#L175), [`FIRMWARE_INSTRUCTION.md:175-176`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/FIRMWARE_INSTRUCTION.md#L175), [`REPORT.md:52`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/REPORT.md#L52), and [`REPORT_REVIEW.md:14-16`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/REPORT_REVIEW.md#L14) all say "current source defaults are `1200` and `1100`" — stale since `92629a8` (2026-08-18) bumped `config.h` to `3000`/`2900`. Any of these docs would fail a viva cross-check against the source. *Fix: update the four files to `3000`/`2900` (or reference "the active `config.h` values" without hardcoding).*
- **M9 — README API row for `POST /api/v1/control/thresholds` contradicts the code and README itself**  
  [`README.md:262`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/README.md#L262) says the endpoint "(does not rewrite firmware edge threshold)" — it **does** rewrite `firmware/src/config.h` and push retained MQTT config (`control.js:62-68`, and README:175 says so too). *Fix: update the row to "Update backend anomaly thresholds, rewrite the firmware `config.h` default, and push the gas alarm/clear pair live over MQTT".*

### LOW

- **N7 — Frontend `FIRMWARE_EDGE_GAS_THRESHOLD = 600` fallback and comment are stale**  
  [`telemetryContract.js:20-21`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/frontend/src/telemetryContract.js#L20-L21) still says "Edge safety is compiled into the ESP32 and is **not changed by the web form**" — the web form now rewrites `config.h` and pushes live thresholds; the fallback value 600 also disagrees with the current `config.h` default 3000. Display-only fallback (real value arrives from `/control/thresholds`), but misleading for maintenance.
- **N8 — `AGENTS.md:49` still asserts `gasLevel > 600 PPM`**  
  The threshold is now configurable (default 3000 in firmware, 600 in backend) and the value is a raw ADC index, not PPM. Agent-guideline contract should read "exceeds the active alarm threshold (raw ADC index)".
- **N9 — `console.log` bypasses the injected MQTT logger**  
  [`mqttService.js:240`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/services/mqttService.js#L240) prints the retained-config confirmation directly while every other log in the module uses the injected `logger`. Tests that silence `console` will still see this line.
- **N10 — Cosmetic indentation breaks**  
  [`telemetryService.js:80`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/backend/services/telemetryService.js#L80) (`if` at column 0 inside an indented block) and `Overview.jsx:30,41,89,115,219,223,323-324,378` (statements at column 0). No behavior impact; inconsistent with surrounding style.
- **N11 — Minor README leftovers from the status-LED removal**  
  [`README.md:46`](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/README.md#L46) tech stack still lists "Red/Green LEDs" (Green/GPIO 17 removed — pinout matrix at README:50-62 is already correct), and the raw telemetry example (`README.md:187-206`) omits the new `metrics.gasAlarmThreshold` field that firmware now always sends. Also `Settings.jsx:247` says the buzzer "auto-clears once gas drops below it" — it actually clears below the clear threshold (`alarm − 100`).

---

## Verified OK

| Check | Command | Result |
|---|---|---|
| Backend full suite | `cd backend && npm test` | **56/56 pass** (incl. new firmware-config + DISARMED gate tests) |
| Focused viva suite | `cd backend && npm run test:kiet` | **46/46 pass + `CB-03 PASS`** |
| Frontend contract suite | `cd frontend && npm test` | **2/2 pass** |
| Frontend production build | `cd frontend && npm run build` | **Success** (5.65 s; 500 kB chunk warning only) |
| Firmware build | `pio run` | **Not run — PlatformIO not installed in this environment** (last verified in repo history; no firmware source changes by the auditor) |
| API contract (11 endpoints) | grep frontend `apiFetch`/`fetch` vs routes | All methods, body fields, and consumed response fields match (`systemArmed`, `firmwareGasEdgeThreshold`, `configDelivery`, `mqtt.mode`, `count`, `data`, `success`). Login/Register/`/auth/me` use raw `fetch` intentionally (public bootstrap). |
| Async threshold sync (end-to-end) | Code audit | `control.js:62-68` → `firmwareConfigService` (config.h rewrite, regex-verified against actual file) + `publishThresholdConfig` (retained QoS 1) → firmware `mqttCallback`/`handleConfig` (`mqtt_service.cpp:66-111`) → `GasSafety::updateThresholds` (mutex-guarded, validation on both ends); `gasAlarmThreshold` read back in telemetry and displayed on Overview/Settings. |
| DISARMED gate | Code audit + tests | Backend 403 for fan while DISARMED (`control.js:110-112`); anomaly evaluation paused (`anomalyEngine.js:335`); frontend freezes cards + disables toggle (`Overview.jsx`); regression tests in `anomalyEngine.test.js` + `authMiddleware.test.js`. |
| Status LED removal | grep | Zero `statusLed`/`STATUS_LED`/`statusLedActive` references repo-wide; `TODO.md:34` `[x]`; pinout matrix updated. |
| Secrets hygiene | `git status` + `git check-ignore` | Clean tree; `backend/.env` and `firmware/include/secrets.h` ignored; template files tracked. |
| MQ2 contract | Code audit | Raw 12-bit `0–4095`, `gasUnit: 'adc_index'`, `gasLevel === gasRaw` enforced; thresholds capped at 4094; `gasAlarmThreshold` validated `1–4094` on ingestion. |
| Working tree | `git status --short` | Clean (HEAD `b133c7b`). |

---

## Notes for the team

- The `firmwareConfigService` runtime rewrite of a **version-controlled source file** (`firmware/src/config.h`) is intentional and documented (`control.js:59-61`, `config.h:40-43`, `Settings.jsx:247`), but remember a Settings save dirties the working tree — commit or reset `config.h` deliberately before/after demos, and never treat it as "code only".
- `pio run` could not be executed here (PlatformIO missing); the firmware build should be re-verified locally before TC-03/TC-06 claims.