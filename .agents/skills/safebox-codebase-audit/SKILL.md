---
name: safebox-codebase-audit
description: Full-stack consistency audit for the SafeRoom IoT Box repo — frontend↔backend API contract verification, TODO.md truth-checking, fake/incomplete feature detection (mock UI controls, unused state), hardcoded constant duplication, dead/redundant code and schema fields, and regression test execution. Use when asked to audit, review for inconsistencies, or verify the codebase matches its documentation.
---

# Safebox Codebase Audit Skill

Audits must be evidence-based: every finding needs a `file:line` reference and should be
cross-checked against the live code, not assumptions. Run the verification commands at the
end before declaring anything complete.

## 1. Contract Verification (Frontend ↔ Backend)

- Extract every `apiFetch` / `fetch` URL from `frontend/src/**` and match it to a route in `backend/routes/*.js` and the mount path in `backend/server.js` (`/api/v1/{auth,telemetry,control,anomalies,chatbot,users}`).
- For each matched pair, verify:
  - HTTP method (GET/POST/PATCH/DELETE) used by the page equals the route verb.
  - Request body field names (`deviceId`, `actuator`, `state`, `message`, `settings`, ...) match what the route destructures.
  - Response shape consumed by the page (`success`, `data`, `count`, `delivery`, `currentActuatorStates`, `mqtt.mode`, `systemArmed`, ...) exists in the route's `res.json(...)`.
- Flag any UI control that appears functional but never affects the request (e.g. a state variable that is set but unused — see known case: Dashboard `timeRange`).

## 2. TODO.md Truth-Checking (Mandatory)

TODO.md is the project's contract with itself (see AGENTS.md §4). For every `[x]` item:

1. Find the implementing file(s).
2. Verify the feature actually exists AND works (not just a stub or decorative UI).
3. Verify the route/method/path named in the TODO matches the real route (watch for renamed or repurposed endpoints, e.g. `DELETE /api/v1/anomalies` vs actual `DELETE /api/v1/anomalies/clear-all` which *resolves*, not deletes).
4. Verify referenced files exist (e.g. i18n claims: `frontend/src/locales/en.json`, `LanguageContext.jsx` — these do NOT exist while TODO marks them `[x]`).
5. Reverse-check: find implemented features that are missing from TODO.md.

## 3. Fake / Incomplete Feature Detection

Look for:
- `useState` values that are set but never read (dead UI state).
- Buttons/toggles that render but do not call the API or change behavior.
- Hardcoded fallbacks that mask missing data (`|| 'admin'`, `|| 'admin@safebox.io'`, `|| 'safebox-01'`).
- Comments claiming a verb/method that differs from the code (`PATCH` comment on a `POST` route).
- "Preset" UI (time ranges, filters) that ignores its own state when building the query.

## 4. Hardcoded Constant Duplication

The safety thresholds (gasMax=600, tempMax=45, tempMin=10, humidityMax=85, humidityMin=20, zScoreLimit=3.0) are the system contract. Search ALL copies:
- `backend/services/anomalyEngine.js` (`DEFAULT_THRESHOLDS`) — the authoritative runtime value
- `backend/models/Schemas.js` (User `settings.thresholds` defaults)
- `frontend/src/pages/Settings.jsx` (initial form state)
- `frontend/src/pages/Overview.jsx` (gas danger check `> 600`, labels)
- `backend/routes/chatbot.js` (PPM threshold in reply text)
- `firmware/src/config/config.h` (`GAS_ALERT_THRESHOLD_PPM`)

Any copy that is not updated when `POST /api/v1/control/thresholds` changes the runtime value is a drift bug. Also grep for `ACTUATOR_STATE_FIELDS` / `ALLOWED_ACTUATORS` / `ACTUATORS` — the fan/buzzer/alertLed set is declared in multiple places.

## 5. Redundancy & Dead Code

- Duplicate config/docs files (e.g. root `AGENTS.md` vs `.agents/AGENTS.md`).
- Stray root `package.json`/`package-lock.json` with no scripts.
- Schema fields nothing reads or writes (e.g. `UserSchema.settings.thresholds`, `lightIntensity` after the LDR was removed) — check with `grep` across services/routes.
- Duplicate enum/map definitions between services (`control.js ALLOWED_ACTUATORS` vs `mqttService.js ACTUATORS`).

## 6. Verification Commands (run before finalizing)

```bash
# Backend: full suite must pass (expect 36 tests)
cd backend && npm test

# Backend: focused viva suite + CB-03 simulation (expect "CB-03 PASS")
cd backend && npm run test:kiet

# Frontend: production build must succeed
cd frontend && npm run build

# Firmware: build (PlatformIO)
cd firmware && pio run
```

Also sanity-check: `git status` clean, no secrets in committed files (`.env`, `secrets.h` are gitignored).

## 7. Output Format

Report findings grouped by severity (High / Medium / Low) as a `AUDIT.md` file, each with:
- What & where (`file:line`)
- Why it is an inconsistency (the contract expectation vs reality)
- Suggested fix (1 line)

End with a "Verified OK" list (tests passing, build passing, contracts that match) so the team knows what was checked and cleared.
