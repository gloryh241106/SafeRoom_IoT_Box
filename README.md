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
- **Sensors & Actuators**: DHT22, PIR HC-SR501, MQ2 Gas, 5V Relay DC Fan, Buzzer, Red/Green LEDs, SSD1306 OLED (I2C)

---

## 🔌 Hardware Pinout Matrix

| GPIO Pin | Sensor / Actuator | Mode / Interface | Purpose |
|---|---|---|---|
| **GPIO 4** | DHT22 Temperature & Humidity | Input (Digital / OneWire) | Periodic temperature and humidity sampling |
| **GPIO 13** | PIR HC-SR501 Motion | Input (Digital Interrupt) | Motion presence detection |
| **GPIO 34** | MQ2 Gas / Smoke | Input (Analog ADC1_CH6) | Gas concentration read (PPM) |
| **GPIO 16** | DC Fan Relay | Output (Digital Output) | Relay actuation (HIGH = ON) |
| **GPIO 17** | Status LED (Green) | Output (Digital Output) | Normal system health indicator |
| **GPIO 18** | Alert LED (Red) | Output (Digital Output) | Visual emergency warning |
| **GPIO 19** | Active Buzzer | Output (PWM via LEDC) | Audible alert tone generator |
| **GPIO 21 / 22** | SSD1306 OLED | I2C (SDA / SCL) | Local real-time display |

---

## 📂 Project Structure

```text
SafeRoom_IoT_Box/
├── backend/                  # Node.js / Express REST API Backend
│   ├── models/               # Mongoose Schemas (SensorReading, AnomalyLog, User)
│   ├── routes/               # API Routes (auth, telemetry, control, anomalies, chatbot, users)
│   ├── services/             # MQTT, Time Series, anomaly, telemetry, email services
│   ├── test/                 # Node test runner coverage for core IoT logic
│   ├── .env.example          # Safe backend configuration template
│   ├── package.json          # Node dependencies
│   └── server.js             # Express server entry point
│
├── firmware/                 # PlatformIO ESP32 firmware for MQTT fan control
│   ├── include/              # Local secrets template
│   ├── src/                  # GPIO 16 relay controller and MQTT client
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
ALERT_RECIPIENT_EMAIL=<recipient-email>
```

On startup, the backend creates `sensor_readings` as a MongoDB Time Series collection when it does not exist and verifies `timeField`, `metaField`, granularity, and 30-day expiry. Startup fails with a migration message if an existing collection has incompatible options.

Start the backend server:
```bash
npm start
```
The server will run on `http://localhost:5000`.

### 3. ESP32 Fan Control Firmware

Copy `firmware/include/secrets.example.h` to `firmware/include/secrets.h`, then set WiFi, EMQX and CA certificate values. The relay signal pin is GPIO 16 and defaults to LOW (fan off).

```bash
cd firmware
pio run
pio run --target upload
pio device monitor
```

The firmware subscribes to `safebox/{deviceId}/control` at QoS 1 and accepts only `{"actuator":"fan","state":"on|off"}`. `FanController::appendActuatorState()` adds `fanOn` to the shared telemetry payload.

#### Test CB-03 fan control

Run the isolated simulation test first. It does not connect to MongoDB, Atlas, EMQX, or an ESP32:

```bash
cd backend
npm run test:cb03
```

The command sends fan ON through the REST API, verifies the reported actuator state, sends fan OFF, and exits with `CB-03 PASS` when the control path works.

For a physical relay and fan test:

1. Connect the relay signal input to ESP32 GPIO 16, use a common ground, and power the relay/fan from a suitable external supply. Do not power the fan from an ESP32 GPIO pin.
2. Put the same device ID and EMQX credentials in `firmware/include/secrets.h` and the backend `.env`.
3. Set `MOCK_HARDWARE=false` in the backend and configure `MQTT_BROKER_URL`, `MQTT_USERNAME`, and `MQTT_PASSWORD`.
4. Flash the ESP32 with `pio run --target upload`, then open `pio device monitor`.
5. Start backend and frontend, open Overview, and press the `CB-03 | DC Fan Relay` button.

Expected result: the dashboard shows `MQTT live`, the serial monitor prints `[Fan] Relay state: ON` or `OFF`, GPIO 16 changes level, and the relay switches the fan. The ESP32 always initializes GPIO 16 LOW so the fan remains off during boot.

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
| `GET` | `/api/v1/telemetry/historical` | Query historical time-series sensor data |
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

## 🧪 Verification

```bash
cd backend
npm test
npm audit

cd ../frontend
npm run build
```

The automated suite covers the 30-sample Z-score baseline, cold start, zero variance, minimum sensor delta, per-device buffers, telemetry/edge-alert validation, Time Series creation, SMTP severity filtering, HTML escaping, and the 15-minute email throttle. Hardware, EMQX, Atlas and SMTP end-to-end checks remain tracked as `TC-02`, `TC-05`, and `TC-06` in [TODO.md](TODO.md).
