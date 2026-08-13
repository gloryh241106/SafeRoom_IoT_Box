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
| **GPIO 13** | PIR HC-SR501 Motion | Input (Digital Interrupt) | Motion presence detection |
| **GPIO 34** | MQ2 Gas / Smoke | Input (Analog ADC1_CH6) | AO through required 15 kΩ / 10 kΩ divider; calibrated LPG-equivalent estimate |
| **GPIO 16** | DC Fan Relay | Output (Digital Output) | Polarity follows `RELAY_ACTIVE_LOW`; HL-52S uses LOW = ON |
| **GPIO 17** | Status LED (Green) | Output (Digital Output) | Normal system health indicator |
| **GPIO 18** | Alert LED (Red) | Output (Digital Output) | Visual emergency warning |
| **GPIO 19** | 3-pin Active Buzzer module | Digital Output (configurable polarity) | Enables the module's built-in tone oscillator |
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
│   │   ├── sensors/          # DHT22, PIR (interrupt latch), MQ2 drivers
│   │   ├── actuators/        # Relay, LEDs, Active Buzzer module drivers
│   │   ├── display/          # SSD1306 OLED (MQ2 WARNING only)
│   │   ├── mqtt/             # MQTTS client (TLS, LWT, backoff reconnect)
│   │   ├── wifi/             # WiFiManager provisioning (Safebox-AP portal)
│   │   ├── safety/           # Edge-local gas safety autonomy
│   │   ├── utils/            # NTP clock + timestamp helpers
│   │   ├── config/           # Pins + application constants
│   │   └── main.cpp          # Orchestrates setup + loop
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

Copy `backend/.env.example` to `backend/.env`. Local development can keep `MOCK_HARDWARE=true` and `EMAIL_ENABLED=false`. For real hardware, configure these values:

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/safebox
JWT_SECRET=<long-random-secret>
DEVICE_ID=safebox-01
MOCK_HARDWARE=false
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

Copy `firmware/include/secrets.example.h` to `firmware/include/secrets.h`, then set `DEVICE_ID` and the EMQX broker host, credentials, and TLS CA certificate. WiFi credentials are provisioned at runtime through the WiFiManager captive portal — no SSID/password is stored in source control.

```bash
cd firmware
pio run
pio run --target upload
pio device monitor
```

The firmware provides:

- **WiFiManager provisioning**: on boot it tries saved NVS credentials asynchronously; on failure (30s timeout) it starts the non-blocking `Safebox-AP` captive portal at `192.168.4.1`. Credentials are saved to NVS while the independent gas-safety task keeps running. The OLED shows boot/connecting/AP/connected states.
- **Sensing**: DHT22 (temp/humidity, 2s), PIR (motion latch), and MQ2 with calibrated ESP32 millivolt reads. MQ2 reports an LPG-equivalent estimate, not a gas-selective laboratory PPM measurement.
- **MQ2 lifecycle**: first use accumulates a 48-hour powered burn-in in NVS, calibrates `Ro` only after a stable clean-air window, and persists `Ro`. Later boots warm for 5 minutes and reuse the saved calibration. States are `burn_in`, `warming_up`, `calibrating`, `ready`, and `fault`.
- **Edge-local safety autonomy**: a priority-3 FreeRTOS task samples MQ2 every 100 ms independently of WiFi/MQTTS. When a ready sensor exceeds `600 PPM`, buzzer and red LED activate immediately and OLED shows WARNING. During preparation, a conservative near-rail ADC fallback stays local; it never creates a fake PPM cloud/email alert.
- **MQTTS telemetry**: publishes temperature, humidity, `gasLevel`, motion, actuator states, and MQ2 diagnostics every 2s. Until MQ2 is ready, `gasLevel` is `null`; backend anomaly/email logic skips gas while retaining the diagnostic state.
- **Remote actuator control**: subscribes to `safebox/{deviceId}/control` (QoS 1) and accepts `{"actuator": "fan|buzzer|alertLed", "state": "on|off"}`. The fan relay on GPIO 16 is remote-only and defaults to active-low for the HL-52S module; edge safety overrides remote buzzer/LED commands while a gas breach is active.
- **Manual hardware recovery**: an optional external normally-open push button connects `EN/RST` to `GND`. It resets the ESP32 without relying on a GPIO or running firmware, so it remains usable if the application hangs. Hold it for about 100 ms and release; never connect EN/RST to 5 V or use a latching switch.

#### Test CB-03 fan control

Run the isolated simulation test first. It does not connect to MongoDB, Atlas, EMQX, or an ESP32:

```bash
cd backend
npm run test:cb03
```

The command sends fan ON through the REST API, verifies the reported actuator state, sends fan OFF, and exits with `CB-03 PASS` when the control path works.

After a real MQTT command is published successfully, the backend records the requested actuator state for immediate status polling. The next validated ESP32 telemetry payload reconciles that state with the device-reported `actuatorStates`, so the dashboard does not fall back to stale simulation values.

For a physical relay and fan test:

1. Connect the relay signal input to ESP32 GPIO 16, use a common ground, and power the relay/fan from a suitable external supply. Do not power the fan from an ESP32 GPIO pin.
2. Put the same device ID and EMQX credentials in `firmware/include/secrets.h` and the backend `.env`.
3. Set `MOCK_HARDWARE=false` in the backend and configure `MQTT_BROKER_URL`, `MQTT_USERNAME`, and `MQTT_PASSWORD`.
4. Flash the ESP32 with `pio run --target upload`, then open `pio device monitor`.
5. Start backend and frontend, open Overview, and press the `CB-03 | DC Fan Relay` button.

Expected result: the dashboard shows `MQTT live`, the serial monitor prints `[Fan] Relay state: ON` or `OFF`, GPIO 16 changes level, and the relay switches the fan. With the default `RELAY_ACTIVE_LOW=1`, boot writes GPIO 16 HIGH so the relay remains open and the fan stays off.

The backend keeps optimistic MQTT command state in `actuatorStateService.js`, then replaces it with the next validated device telemetry snapshot. This isolates actuator-state ownership from the mock telemetry generator and makes the requested-versus-confirmed state flow easier to explain and test.

### 4. Frontend Setup
In a new terminal:
```bash
cd frontend
npm ci
npm run dev
```
Open `http://localhost:3000` in your browser to access the **SafeboxManager** web dashboard.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | User registration |
| `POST` | `/api/v1/auth/login` | User authentication & JWT issuance |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile |
| `GET` | `/api/v1/telemetry/latest` | Get latest live sensor reading |
| `GET` | `/api/v1/telemetry/historical` | Query the newest bounded time-series samples, returned in chronological order |
| `POST` | `/api/v1/control/actuator` | Actuate remote outputs (Fan, Buzzer, Alert LED, Armed) |
| `GET` | `/api/v1/control/status` | Get MQTT/device connection and actuator status |
| `GET` | `/api/v1/control/thresholds` | Fetch current system safety thresholds |
| `POST` | `/api/v1/control/thresholds` | Update production safety thresholds (Gas, Temp, Humidity, Z-Score) |
| `GET` | `/api/v1/anomalies` | Query active or historical anomaly logs |
| `PATCH` | `/api/v1/anomalies/:id/resolve` | Mark an anomaly as resolved |
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

---

## 🧪 Verification

```bash
cd backend
npm test
npm run test:kiet
npm audit

cd ../frontend
npm run build
```

The full backend suite contains 36 tests covering JWT route protection, authenticated CB-03 control, MQTT topic-map subscription, newest-first Time Series selection, the 30-sample Z-score baseline, cold start, zero variance, minimum sensor delta, per-device buffers, actuator-state reconciliation, MQ2 readiness/diagnostic telemetry, false gas-alert suppression, edge-alert validation, Time Series creation, user-managed email preferences, profile-recipient selection, SMTP severity filtering, Vietnam-time email rendering, HTML escaping, and the 15-minute email throttle. It also verifies the integrated Z-score spike -> fan command -> anomaly log -> email path. `npm run test:kiet` runs the focused tests for Thai Kiet's scope and then the isolated CB-03 simulation, which must exit with `CB-03 PASS`. Hardware timing, EMQX, Atlas, frontend-alert, and SMTP end-to-end checks remain tracked in [TODO.md](TODO.md).

Current dependency audit status: backend reports 0 vulnerabilities. Frontend production build succeeds, while `npm audit` reports advisories in the Vite/esbuild and React Router dependency lines; the required migration and regression pass remains tracked in `TODO.md` rather than applying forced major upgrades during feature work.
