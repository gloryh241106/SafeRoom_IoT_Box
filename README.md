# SafeRoom IoT Box ("Safebox") 🛡️⚡

An integrated IoT environment monitoring, safety management, and automated emergency alert system. Combines ESP32 hardware sensing, cloud MQTT messaging (EMQX), Express.js backend, MongoDB Atlas time-series database, rule-based anomaly detection, Nodemailer email notifications, and the **SafeboxManager** React web dashboard.

---

## 📐 System Architecture

```text
  +---------------------------------------------------------------------------------+
  |                                 USER / CLIENT                                   |
  +---------------------------------------+-----------------------------------------+
                                          |
                      [8] SoftAP Provisioning | [1] HTTP REST API
                                          v
+------------------+             +--------------------+            +--------------------+
|  ESP32 Firmware  | <=========> |   EMQX Broker      | <========> | Express.js Backend |
| (WiFiManager/MQTT)  [4] MQTTS  | (MQTT Pub/Sub)     |  [3] MQTTS | (Node.js Engine)   |
+--------+---------+             +--------------------+            +----+----------+----+
         |                                                              |          |
     [5] | Sensors Input                                            [2] | Mongoose | [7] Nodemailer
         v                                                              v          v
  +--------------+                                              +---------------+  +--------------+
  | DHT22, PIR,  |                                              | MongoDB Atlas |  | User Email   |
  |    MQ2       |                                              |  (3 Colls)    |  | Alerts       |
  +--------------+                                              +---------------+  +--------------+
         |
     [6] | Actuation Output
         v
  +--------------+
  | DC Fan Relay,|
  | Buzzer, LEDs,|
  | OLED Display |
  +--------------+
```

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, Lucide Icons
- **Backend**: Node.js, Express.js REST API, Mongoose ODM, JWT, bcryptjs
- **Database**: MongoDB Atlas / MongoDB Time-Series (`sensor_readings`, `anomaly_logs`, `users`)
- **Messaging**: EMQX Cloud Serverless (MQTTS Port 8883, TLS, basic auth)
- **Microcontroller**: ESP32 DevKit V1 (Arduino C++, WiFiManager, PubSubClient)
- **Sensors & Actuators**: DHT22, PIR HC-SR501, MQ2 Gas, 5V Relay DC Fan, 3-pin Active Buzzer module, Red/Green LEDs, SSD1306 OLED (I2C), external hardware reset button

---

## 🔌 Hardware Pinout Matrix

| GPIO Pin | Sensor / Actuator | Mode / Interface | Purpose |
|---|---|---|---|
| **GPIO 4** | DHT22 Temperature & Humidity | Input (Digital / OneWire) | Periodic temperature and humidity sampling |
| **GPIO 13** | PIR HC-SR501 Motion | Digital Input | Direct HIGH/LOW module output; no firmware latch |
| **GPIO 34** | MQ2 Gas / Smoke | Input (Analog ADC1_CH6) | Direct 12-bit `0–4095` ADC index (not PPM) |
| **GPIO 16** | DC Fan Relay | Output (Digital Output) | Polarity follows `RELAY_ACTIVE_LOW`; HL-52S uses LOW = ON |
| **GPIO 18** | Alert LED (Red) | Output (Digital Output) | Visual emergency warning |
| **GPIO 19** | 3-pin Active Buzzer module | Digital Output (configurable polarity) | Enables the module's built-in tone oscillator; module VCC must be 5 V (3.3 V is too weak) |
| **GPIO 21 / 22** | SSD1306 OLED | I2C (SDA / SCL) | Local MQ2 WARNING display only |
| **EN/RST + GND** | Normally-open reset push button | Hardware reset (no GPIO/code) | Pull EN low while pressed to recover from a firmware hang |

---

## 📂 Project Structure

```text
SafeRoom_IoT_Box/
├── backend/                  # Node.js / Express REST API Backend
│   ├── models/               # Mongoose Schemas (SensorReading, AnomalyLog, User)
│   ├── routes/               # API Routes (auth, telemetry, control, anomalies, chatbot, users)
│   ├── services/             # MQTT, actuator state, Time Series, anomaly, telemetry, email
│   ├── test/                 # Node test runner coverage for core IoT logic
│   ├── .env.example          # Safe backend configuration template
│   ├── package.json          # Node dependencies
│   └── server.js             # Express server entry point
│
├── firmware/                 # PlatformIO ESP32 firmware (sensing, edge safety, MQTT, WiFiManager)
│   ├── include/              # Secrets template (secrets.h is git-ignored)
│   ├── src/
│   │   ├── main.cpp          # Explicit setup/loop orchestration
│   │   ├── config.h          # Pins, intervals and non-secret settings
│   │   ├── device_state.h    # Shared sensor/actuator value structures
│   │   ├── sensors/          # Independent DHT22, PIR and MQ2 readers
│   │   ├── actuators/        # All output GPIOs and safety override
│   │   ├── display/          # SSD1306 OLED rendering
│   │   ├── network/          # Basic WiFiManager and MQTTS services
│   │   └── features/         # Gas safety task and telemetry JSON
│   └── platformio.ini        # ESP32 DevKit build configuration
│
├── frontend/                 # SafeboxManager React + Vite Dashboard
│   ├── src/
│   │   ├── components/       # Navbar, Sidebar
│   │   ├── pages/            # Overview, Dashboard, Chatbot, Settings, Login, Register
│   │   ├── App.jsx           # Router & layout
│   │   └── main.jsx          # Entry point
│   ├── package.json          # React dependencies
│   └── vite.config.js        # Vite config & API proxy
│
├── docs/                     # Architecture, code walkthrough, viva Q&A, demo guide
├── .agents/skills/           # Agent domain skills (esp32, iot-backend, safebox-frontend)
├── TODO.md                   # Master task registry and integration checklist
├── EVALUATE.md               # Evidence-based rubric, source audit, gaps, and 10-point checklist
├── AGENTS.md                 # Agent guidelines and project rules
└── README.md                 # Project documentation
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js (v18+) & `npm`
- MongoDB database connection (local or MongoDB Atlas)
- PlatformIO (only required to build/flash the ESP32 firmware)

### 2. Backend Setup
```bash
cd backend
npm ci
```

Copy `backend/.env.example` to `backend/.env`. Runtime telemetry is accepted only from the configured ESP32/EMQX MQTT path; the backend no longer generates synthetic sensor readings. Configure these values:

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/safebox
JWT_SECRET=<long-random-secret>
DEVICE_ID=safebox-01
MQTT_BROKER_URL=mqtts://<emqx-host>:8883
MQTT_USERNAME=<emqx-username>
MQTT_PASSWORD=<emqx-password>
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-app-password>
ALERT_RECIPIENT_EMAIL=<optional-fallback-email>
```

On startup, the backend creates `sensor_readings` as a MongoDB Time Series collection when it does not exist and verifies `timeField`, `metaField`, granularity, and 30-day expiry. Startup fails with a migration message if an existing collection has incompatible options.

Start the backend server:
```bash
npm start
```
The server will run on `http://localhost:5000`.

All telemetry, control, anomaly, chatbot, and user endpoints require a valid JWT. To create or refresh a local demo account without committing its credentials, set `DEMO_USERNAME`, `DEMO_EMAIL`, and `DEMO_PASSWORD` in `backend/.env`, then run:

```bash
npm run seed:demo-user
```

HIGH and CRITICAL anomaly emails are sent to the profile email of every user whose email-alert preference is enabled in Settings. `ALERT_RECIPIENT_EMAIL` is used only as a development fallback when the database has no user accounts; SMTP sender credentials remain server-side secrets.

### 3. ESP32 Firmware

Copy `firmware/include/secrets.example.h` to `firmware/include/secrets.h`, then set `DEVICE_ID` and the EMQX broker host, credentials, and TLS CA certificate. Router credentials are provisioned at runtime through `Safebox-AP` (`12345678`) and are never stored in source code. The fixed AP password is intentionally simple for the coursework demo; change `WIFI_AP_PASSWORD` in `firmware/src/config.h` before using the design outside a controlled classroom environment.

```bash
cd firmware
pio run
pio run --target upload
pio device monitor
```

The firmware provides:

- **Basic report-oriented architecture**: `main.cpp` visibly owns setup and loop order; sensors, actuators, OLED, networking, gas safety and telemetry are small focused modules. There is no application-wrapper class or custom WiFiManager web layer.
- **Beginner-readable comments**: every firmware module and function has Vietnamese comments describing its purpose, return value and important safety/network behavior. Start with `firmware/src/main.cpp`, then use each module's `.h` file as its API guide.
- **Firmware debug map**: module responsibilities, invariants, runtime flow, and symptom-to-file tracing are documented in [firmware/ARCHITECTURE.md](firmware/ARCHITECTURE.md).
- **WiFiManager provisioning**: boot tries the router credential already saved in ESP32 NVS. If that fails, the standard non-blocking WiFiManager portal opens `Safebox-AP` with password `12345678` at `192.168.4.1`. Saving a valid 2.4 GHz network reconnects the ESP32 and MQTT without a firmware reflash.
- **Raw device snapshot**: each 2-second publish copies current DHT22, PIR, MQ2 and actuator values into one backend-compatible JSON document. Invalid DHT snapshots are not published as fake zeroes.
- **MQ2 threshold**: firmware selects 12-bit ADC resolution and publishes integer `0–4095` raw counts. The current source defaults are an alarm threshold of `1200` and a clear threshold of `1100` (`firmware/src/config.h`); the clear threshold remains 100 counts below the alarm. Saving the Settings "BACKEND MQ-2 Raw ADC Max" field both rewrites `config.h` (the reboot/reflash default) and pushes the value live to the ESP32 over MQTT on `safebox/{deviceId}/config` (retained QoS 1), so a flashed device applies the new level immediately without a rebuild. Alarm decisions are suppressed for the first 30 s while the cold MQ2 heater settles (readings publish as `gasValid=false` during that window). Afterwards, three consecutive 50 ms samples above the active alarm threshold trigger local safety within 150 ms; the alarm clears after three samples below the active clear threshold, or after 5 s sustained below the alarm threshold. This rejects startup and isolated ADC spikes without presenting the raw threshold as calibrated concentration.
- **MQ2 reading**: there is no interpolation, boot calibration, median filter, EMA, millivolt conversion, or PPM conversion. Each 100 ms safety poll reads GPIO 34 once, so natural ADC/sensor fluctuation remains visible.
- **Edge-local safety path**: a pinned, priority-4 FreeRTOS task is the sole MQ2 reader and samples every 50 ms. It directly activates the buzzer/red LED and writes the serialized OLED warning when raw ADC exceeds the active alarm threshold (current source default 1200; updatable at runtime via `safebox/{deviceId}/config`), independently of WiFi scans, credential-save waits, and synchronous MQTTS connects in `loopTask`. MQTT alerts are handed back as sticky events and retried after broker outages. The architecture removes network calls from the read-to-actuation path; physical TC-03 measurement is still required before claiming the `<200 ms` result on the assembled box.
- **MQTTS telemetry**: certificate validation and MQTT connection attempts begin only after SNTP reports a valid Unix time. Telemetry is then published every 2s at QoS 0. The retained `online` status is QoS 0, while the retained `offline` LWT is configured at QoS 1. PubSubClient can subscribe at QoS 0/1 but only publishes at QoS 0, so firmware edge alerts are also QoS 0. Serial diagnostics distinguish an NTP wait from the underlying `WiFiClientSecure` TLS error.
- **Remote actuator control**: subscribes to `safebox/{deviceId}/control` (QoS 1) and accepts `{"actuator": "fan", "state": "on|off"}`. The fan relay on GPIO 16 is remote-only and defaults to active-low for the HL-52S module. The buzzer (GPIO 19) and alert LED (GPIO 18) are NOT remotely controllable: they are driven exclusively by the local edge gas alarm (gas above the `config.h` threshold).
- **Installed buzzer polarity**: the active-buzzer module is **low level trigger** (active-LOW: SIG LOW = ON) and is powered at **3.3 V**, so the GPIO's 3.3 V HIGH level fully turns it OFF (verified on hardware). SIG is wired directly to GPIO 19, VCC to 3.3 V, GND to GND, and `config.h` sets `BUZZER_ACTIVE_LOW=true`. 5 V must never be applied to the ESP32 GPIO; a 5 V supply would additionally require an NPN driver stage with `BUZZER_ACTIVE_LOW=false` (see FIRMWARE_INSTRUCTION.md).
- **Manual hardware recovery**: an optional external normally-open push button connects `EN/RST` to `GND`. It resets the ESP32 without relying on a GPIO or running firmware, so it remains usable if the application hangs. Hold it for about 100 ms and release; never connect EN/RST to 5 V or use a latching switch.

#### Raw telemetry object contract

Sensor acquisition populates this object first; `Telemetry` then copies it into JSON and the MQTT client only transports the serialized bytes. `gasLevel` is retained as a compatibility alias and must equal `gasRaw`.

```json
{
  "deviceId": "safebox-01",
  "metrics": {
    "temperature": 28.4375,
    "humidity": 64.125,
    "gasLevel": 527,
    "gasRaw": 527,
    "gasValid": true,
    "gasUnit": "adc_index",
    "motionDetected": false
  },
"actuatorStates": {
    "fanOn": false,
    "buzzerActive": false,
    "alertLedActive": false,
    "gasAlarmActive": false
  }
}
```

`gasAlarmActive` reports the device's local MQ2 safety override. While it is `true`, the buzzer and red LED are physically held active by the edge safety task until the gas reading drops below the active clear threshold (current source default 1100) or stays below the active alarm threshold (current source default 1200) for 5 s; the OLED shows the local gas warning for the same window. Because the buzzer and alert LED are edge-only outputs, the web dashboard offers no buzzer/LED controls.

The backend requires integer MQ2 values inside `0–4095`, requires `gasUnit: "adc_index"` on new frames, and rejects a frame when `gasLevel` and `gasRaw` disagree. Runtime backend gas thresholds stop at `4094`, ensuring the maximum ADC sample can still breach a rule that uses `raw > threshold`. Dashboard formatting is presentation-only, so stored and exported samples retain the firmware values.

#### Test CB-03 fan control

Run the isolated actuator-command simulation test first. It does not generate telemetry, write MongoDB data, or connect to Atlas, EMQX, or an ESP32:

```bash
cd backend
npm run test:cb03
```

The command sends fan ON through the REST API, verifies the reported actuator state, sends fan OFF, and exits with `CB-03 PASS` when the control path works.

After a real MQTT command is published successfully, the backend records the requested actuator state for immediate status polling. The next validated ESP32 telemetry payload reconciles that state with the device-reported `actuatorStates`, so the dashboard does not retain stale optimistic values.

For a physical relay and fan test:

1. Connect the relay signal input to ESP32 GPIO 16, use a common ground, and power the relay/fan from a suitable external supply. Do not power the fan from an ESP32 GPIO pin.
2. Put the same device ID and EMQX credentials in `firmware/include/secrets.h` and the backend `.env`.
3. Configure `MQTT_BROKER_URL`, `MQTT_USERNAME`, and `MQTT_PASSWORD` in the backend.
4. Flash the ESP32 with `pio run --target upload`, then open `pio device monitor`.
5. Start backend and frontend, open Overview, and press the `CB-03 | DC Fan Relay` button.

Expected result: the dashboard shows `MQTT live`, GPIO 16 changes level, and the relay switches the fan. With the default `RELAY_ACTIVE_LOW=true`, boot writes GPIO 16 HIGH so the relay remains open and the fan stays off.

The backend keeps optimistic MQTT command state in `actuatorStateService.js`, then replaces it with the next validated device telemetry snapshot. Runtime sensor readings are never synthesized by the backend; they enter through validated MQTT telemetry from the ESP32.

### 4. Frontend Setup
In a new terminal:
```bash
cd frontend
npm ci
npm run dev
```
Open `http://localhost:3000` in your browser to access the **SafeboxManager** web dashboard.

When no ESP32 telemetry exists, Overview and the chatbot report an explicit no-data state. They do not substitute zero, false, or synthetic sensor values.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | User registration |
| `POST` | `/api/v1/auth/login` | User authentication & JWT issuance |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile |
| `GET` | `/api/v1/telemetry/latest` | Get latest live sensor reading |
| `GET` | `/api/v1/telemetry/historical` | Query the newest bounded time-series samples, returned in chronological order |
| `POST` | `/api/v1/control/actuator` | Actuate the remote `fan` or toggle the backend `systemArmed` switch (buzzer/alert LED are edge-only, not remotely controllable; fan commands are rejected with HTTP 403 while the system is DISARMED) |
| `GET` | `/api/v1/control/status` | Get MQTT/device connection and actuator status |
| `GET` | `/api/v1/control/thresholds` | Fetch current system safety thresholds |
| `POST` | `/api/v1/control/thresholds` | Update backend anomaly thresholds and persist to user profile (does not rewrite firmware edge threshold) |
| `GET` | `/api/v1/anomalies` | Query active or historical anomaly logs |
| `PATCH` | `/api/v1/anomalies/:id/resolve` | Mark a single anomaly as resolved |
| `DELETE` | `/api/v1/anomalies/clear-all` | Resolve all active anomaly logs (marks `resolved: true`, retains audit records) |
| `POST` | `/api/v1/chatbot/query` | Sentence natural language intent query assistant |
| `GET` | `/api/v1/users/profile` | Get user account settings |
| `POST` | `/api/v1/users/profile` | Update user password or notification options |

---

## Thai Kiet Viva Guide

The following documents map Thai Kiet's proposal responsibilities (`CB-03`, `NC-01`, `NC-03`, and `NC-05`) to the implemented code and verification evidence:

- [Scope, architecture, and defense summary](docs/THAI_KIET_VIVA.md)
- [Line-by-line code walkthrough](docs/THAI_KIET_CODE_WALKTHROUGH.md)
- [Oral-defense questions and model answers](docs/THAI_KIET_QA.md)
- [Repeatable software and hardware demo guide](docs/THAI_KIET_DEMO.md)
- [Merged dark-theme PDF handbook](output/pdf/Cam_nang_Thai_Kiet_SafeRoom.pdf) with its [editable LaTeX source](output/pdf/Cam_nang_Thai_Kiet_SafeRoom.tex)

The merged handbook is an A4, 60-page dark reading edition with white text, Vietnamese table of contents, PDF bookmarks, syntax-highlighted code, a redrawn architecture diagram, and verified table wrapping. It preserves the four source guides in the reading order: viva overview, Q&A, code walkthrough, then demo procedure.

---

## Nguyen Huy Hoang Viva Guide

The following document maps Nguyen Huy Hoang's proposal responsibilities (`CB-01`, `NC-02`, `NC-07`, and `NC-09`) to the implemented code and verification evidence:

- [Viva knowledge base and Q&A prep](docs/NGUYEN_HUY_HOANG_VIVA.md)

---

## 🧪 Verification

```bash
cd backend
npm test
npm run test:kiet
npm audit

cd ../frontend
npm test
npm run build
```

The full backend suite currently contains 56 passing tests covering JWT route protection, authenticated CB-03 control, DISARMED fan-command rejection and re-arm flow, DISARMED anomaly suppression with resume after re-arming, MQTT topic-map subscription, newest-first Time Series selection, the 30-sample Z-score baseline, zero variance, minimum sensor delta, per-device buffers, actuator-state reconciliation (including rejection of non-remote actuators), explicit chatbot no-data responses, the integer MQ2 ADC telemetry contract, malformed edge-alert rejection, invalid-sample false-alert suppression, Time Series creation, user-managed email preferences, profile-recipient selection, SMTP severity filtering, Vietnam-time email rendering, HTML escaping, and the 15-minute email throttle. It also verifies the integrated Z-score spike -> fan command -> anomaly log -> email path. `npm run test:kiet` runs 46 focused backend tests and then the isolated CB-03 actuator simulation, which must exit with `CB-03 PASS`; the frontend contract suite contains 2 tests. Hardware timing, EMQX, Atlas, frontend-alert, and SMTP end-to-end checks remain tracked in [TODO.md](TODO.md). The rubric-oriented gap analysis is maintained in [EVALUATE.md](EVALUATE.md).

Current dependency audit status: backend reports 0 vulnerabilities. Frontend production build succeeds, while `npm audit` reports advisories in the Vite/esbuild and React Router dependency lines; the required migration and regression pass remains tracked in `TODO.md` rather than applying forced major upgrades during feature work.

MQ2 measurement note: Winsen specifies a 300–10,000 ppm flammable-gas detection range under defined test conditions, a 5 V heater/circuit supply, and at least 48 hours of preheating. Its datasheet supplies characteristic curves rather than a universal module-level PPM equation. Therefore this project reports a reproducible ADC index and does not label an uncalibrated value as PPM. See the [official Winsen MQ-2 manual](https://www.winsen-sensor.com/d/files/manual/mq-2.pdf).
