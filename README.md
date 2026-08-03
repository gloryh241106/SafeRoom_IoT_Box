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
  |  MQ2, LDR    |                                              |  (3 Colls)    |  | Alerts       |
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
- **Sensors & Actuators**: DHT22, PIR HC-SR501, MQ2 Gas, LDR Light, 5V Relay DC Fan, Buzzer, Red/Green LEDs, SSD1306 OLED (I2C)

---

## 🔌 Hardware Pinout Matrix

| GPIO Pin | Sensor / Actuator | Mode / Interface | Purpose |
|---|---|---|---|
| **GPIO 4** | DHT22 Temperature & Humidity | Input (Digital / OneWire) | Periodic temperature and humidity sampling |
| **GPIO 13** | PIR HC-SR501 Motion | Input (Digital Interrupt) | Motion presence detection |
| **GPIO 34** | MQ2 Gas / Smoke | Input (Analog ADC1_CH6) | Gas concentration read (PPM) |
| **GPIO 35** | LDR Light Sensor | Input (Analog ADC1_CH7) | Light intensity via voltage divider |
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
│   ├── services/             # Anomaly engine, mock telemetry generator, email service
│   ├── .env                  # Backend environment configuration
│   ├── package.json          # Node dependencies
│   └── server.js             # Express server entry point
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
├── PHASE-1.md ... PHASE-5.md # 5-Week Phase Deliverables Roadmap
├── TODO.md                   # Real hardware, MQTT, Nodemailer & Z-score integration guide
├── AGENTS.md                 # Agent guidelines and project rules
├── RESOLUTION.md             # Project constraints and ambiguity resolutions
└── README.md                 # Project documentation
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js (v18+) & `npm`
- MongoDB database connection (local or MongoDB Atlas)

### 2. Backend Setup
```bash
cd backend
npm install
```

Configure `backend/.env`:
```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/safebox
JWT_SECRET=safebox_secret_key_2026
DEVICE_ID=safebox-01
MOCK_HARDWARE=true
```

Start the backend server:
```bash
npm start
```
The server will run on `http://localhost:5000`.

### 3. Frontend Setup
In a new terminal:
```bash
cd frontend
npm install
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
| `GET` | `/api/v1/anomalies` | Query active or historical anomaly logs |
| `PATCH` | `/api/v1/anomalies/:id/resolve` | Mark an anomaly as resolved |
| `POST` | `/api/v1/chatbot/query` | Sentence natural language intent query assistant |
| `GET` | `/api/v1/users/profile` | Get user account settings |
| `POST` | `/api/v1/users/profile` | Update user password or notification options |

---

## 📖 Phase Roadmap & Hardware Integration

- **[PHASE-1.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-1.md)** — Weeks 1–2: Infrastructure Bootstrap & End-to-End Vertical Slices
- **[PHASE-2.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-2.md)** — Weeks 2–3: User Authentication, MQ2/LDR Edge Alerts, MongoDB Time-Series
- **[PHASE-3.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-3.md)** — Weeks 3–4: Anomaly Engine, Email Notifications, Dashboard Charts
- **[PHASE-4.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-4.md)** — Weeks 4–5: Rule-based Chatbot, Z-Score Finalization, Settings Page
- **[PHASE-5.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/PHASE-5.md)** — Week 5 (final): System Integration Testing (TC-01..TC-06) & Demonstration

For instructions on connecting real ESP32 hardware, real EMQX MQTT brokers, real SMTP email servers, or enabling statistical Z-score calculations ($|Z| > 3.0$), refer to **[TODO.md](file:///home/pbkhang404/Documents/HCMUS/Y2/S3/iot/SafeRoom_IoT_Box/TODO.md)**.
