---
name: safebox-frontend-dashboard
description: React + Tailwind CSS UI architecture, Recharts historical telemetry visualization, rule-based chatbot interface, and live status polling for SafeboxManager.
---

# SafeboxManager Frontend Dashboard Skill

## Application Architecture

The **SafeboxManager** web dashboard built with React, Vite, Tailwind CSS, Recharts, and Lucide Icons contains four primary views:

1. **Overview Page**: Real-time metric cards (Temp, Humidity, Gas, Motion), active anomaly alert banners, and quick actuator control toggles (DC Fan, Buzzer, Alert LED).
2. **Dashboard Page**: Interactive Recharts time-series charts (1h, 6h, 24h, 7d ranges) with CSV telemetry data export functionality.
3. **Chatbot Page**: Custom command-line chat UI parsing keyword queries (`status`, `gas`, `motion`, `temp`, `humidity`, `anomalies`, `help`) with quick-action prompt pills.
4. **Settings Page**: User account profile management, email notification toggles, and display of authoritative system safety thresholds.

---

## Real-Time Polling & State Synchronization

- Baseline polling mechanism: `GET /api/v1/telemetry/latest` requested every **2 to 5 seconds**.
- Optimistic UI updates when toggling actuators (`POST /api/v1/control/actuator`), confirmed by subsequent telemetry poll.
- Connection status indicator (Online / Offline / Degraded) based on LWT status and polling health.

---

## Chatbot Router Interface (`/chatbot`)

Command routing logic executed at `/api/v1/chatbot/query`:
- `status` → Formatted summary of live telemetry + fan/buzzer states.
- `gas` → Latest gas reading + details of last gas anomaly log.
- `motion` → Current PIR state + timestamp of last motion trigger.
- `temp` / `temperature` → Latest temp reading + rolling Z-score status.
- `anomalies` → Count of active unresolved anomaly logs.
- `help` → Markdown-formatted list of supported commands.

---

## UI Design Guidelines

- **Theme**: Sleek dark mode / modern glassmorphism UI with vibrant status accents (Emerald for normal, Amber for warning, Crimson for critical alarms).
- **Typography**: Clean sans-serif fonts (e.g. Inter / Roboto).
- **Iconography**: Lucide React icons (`Thermometer`, `Droplets`, `Flame`, `Sun`, `Activity`, `Fan`, `Bell`, `ShieldAlert`, `MessageSquare`, `Settings`).
- **No static placeholders**: Use dynamic loading states, realistic fallback data, or generated visual assets.
