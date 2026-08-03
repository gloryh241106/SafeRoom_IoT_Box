# Phase 2 — Authentication & Remaining Sensor Integration (Weeks 2–3)

## Goal

Add **user authentication** (register/login), wire the remaining sensors (**MQ2 gas**, **LDR light**) into the telemetry pipeline, implement **edge-local gas/smoke safety alerts** (buzzer, LEDs, OLED), begin **MongoDB time-series storage** for historical queries, and start the **historical charting** frontend feature.

---

## Owner Assignments

| Owner | Task ID | Deliverable |
|-------|---------|-------------|
| **Hoàng** | NC-07 | Register / Login (backend + frontend) |
| **Hoàng** | NC-02 | MQ2 + OLED + Alert LED + Buzzer local alert logic |
| **Hoàng** | NC-09 (start) | WiFiManager provisioning (begin) |
| **Khang** | NC-04 (start) | MongoDB → Backend → Frontend → Chart (begin) |
| **Kiệt** | NC-03 | Sensor data → MongoDB Time-Series collection |

---

## Deliverables

### 1. NC-07 — User Authentication (Hoàng)

**Backend**
- [ ] Define `users` collection schema (Mongoose):
  ```javascript
  const UserSchema = new Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    notificationPreferences: {
      emailEnabled: { type: Boolean, default: true },
      thresholds: { type: Object, default: {} }
    },
    createdAt: { type: Date, default: Date.now }
  });
  ```
- [ ] `POST /api/v1/auth/register` — validate input, hash password (bcrypt), create user.
- [ ] `POST /api/v1/auth/login` — verify credentials, return session/token.
- [ ] Auth middleware to protect API routes (`/telemetry/*`, `/control/*`, `/anomalies/*`).

**Frontend**
- [ ] Login page with form validation.
- [ ] Register page.
- [ ] Auth context/provider; redirect unauthenticated users to login.
- [ ] Persist session (localStorage or cookie).

### 2. NC-02 — Edge-Local Gas/Smoke Safety Alerts (Hoàng)

**ESP32 Firmware**
- [ ] Wire **MQ2** sensor: analog to GPIO 34 (ADC1_CH6), heater to 5V rail.
- [ ] Wire **LDR** to GPIO 35 (ADC1_CH7) via voltage divider.
- [ ] Wire **Alert LED (Red)** to GPIO 18 (digital output).
- [ ] Wire **Status LED (Green)** to GPIO 17 (digital output).
- [ ] Wire **Buzzer** to GPIO 19 (PWM via LEDC).
- [ ] Wire **SSD1306 OLED** to GPIO 21 (SDA) / GPIO 22 (SCL) via I2C.
- [ ] Implement **edge-local safety logic** (runs without network):
  - If `gasLevel > 600 PPM` → immediately activate Buzzer (PWM pattern) + Alert LED (ON) + OLED warning message.
  - This must work even when WiFi/MQTT is disconnected (TC-03).
- [ ] Publish edge alert to `safebox/{deviceId}/alerts` (QoS 1) when gas breach detected:
  ```json
  {
    "type": "EDGE_SAFETY_TRIGGER",
    "sensorType": "gasLevel",
    "observedValue": 720,
    "threshold": 600,
    "timestamp": 1719000000000
  }
  ```
- [ ] Include `gasLevel`, `lightIntensity` in periodic telemetry payloads.
- [ ] Include `actuatorStates.buzzerActive`, `actuatorStates.alertLedActive` in telemetry.
- [ ] OLED display: cycle through current sensor values (temp, humidity, gas, light, motion) on the local screen.

### 3. NC-03 — MongoDB Time-Series Storage (Kiệt)

**Backend**
- [ ] Verify `sensor_readings` collection is configured as a proper MongoDB Time-Series collection:
  - `timeField: 'timestamp'`
  - `metaField: 'deviceId'`
  - `granularity: 'seconds'`
  - `expireAfterSeconds: 2592000` (30-day TTL)
- [ ] Refactor the MQTT telemetry ingestion handler to use the full `SensorReadingSchema` (from MERGED.md §4).
- [ ] Expose `GET /api/v1/telemetry/historical?from={start}&to={end}&sensor={type}`:
  - Query `sensor_readings` with date range filter.
  - Optional `sensor` param to select specific metric fields.
  - Return array of documents sorted by timestamp ascending.

### 4. NC-04 — Historical Telemetry Charts (Khang, start)

**Frontend — Dashboard Page**
- [ ] Time-range selector (last 1h, 6h, 24h, 7d, custom).
- [ ] **Recharts** line charts for:
  - Temperature over time
  - Humidity over time
  - Gas level over time
  - Light intensity over time
- [ ] Fetch data from `GET /api/v1/telemetry/historical`.
- [ ] Loading states and empty-data placeholders.

### 5. NC-09 — WiFiManager Provisioning (Hoàng, start)

**ESP32 Firmware**
- [ ] Integrate **WiFiManager** Arduino library.
- [ ] On boot: attempt to connect to saved WiFi credentials from NVS.
- [ ] If connection fails within 30 seconds → spin up SoftAP named `Safebox-AP`.
- [ ] Serve captive portal at `192.168.4.1` for WiFi credential input.
- [ ] On submit: save credentials to NVS, reboot into Station mode.
- [ ] Display assigned IP address on OLED after successful connection.

---

## New MQTT Topics in This Phase

| Topic | Direction | QoS |
|-------|-----------|-----|
| `safebox/{deviceId}/alerts` | ESP32 → Backend | 1 |

---

## Hardware Wiring Added in This Phase

| GPIO | Device | Mode |
|------|--------|------|
| 34 | MQ2 Gas/Smoke Sensor | Input (Analog Read) |
| 35 | LDR Light Sensor | Input (Analog Read) |
| 17 | Status LED (Green) | Output (Digital/PWM) |
| 18 | Alert LED (Red) | Output (Digital/PWM) |
| 19 | Active Buzzer | Output (PWM LEDC) |
| 21 | SSD1306 OLED (SDA) | I2C Data |
| 22 | SSD1306 OLED (SCL) | I2C Clock |

---

## API Endpoints Added in This Phase

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | User registration |
| POST | `/api/v1/auth/login` | User login |
| GET | `/api/v1/telemetry/historical` | Historical sensor data query |

---

## Verification Checklist

- [ ] **V2-01**: User can register and login via the frontend; unauthenticated requests are rejected.
- [ ] **V2-02**: MQ2 gas readings appear in telemetry payloads and on the frontend Overview page.
- [ ] **V2-03**: LDR light readings appear in telemetry payloads and on the frontend Overview page.
- [ ] **V2-04**: Applying smoke/gas to MQ2 with WiFi OFF triggers buzzer + alert LED within < 200 ms (TC-03).
- [ ] **V2-05**: OLED displays current sensor readings locally.
- [ ] **V2-06**: Edge alert published to `safebox/{deviceId}/alerts` arrives at backend and is logged.
- [ ] **V2-07**: Historical data query returns correct date-filtered results from MongoDB.
- [ ] **V2-08**: Dashboard page shows at least one Recharts line chart with real historical data.
- [ ] **V2-09**: WiFiManager captive portal opens when no WiFi credentials are saved; credentials persist across reboots (TC-01).
- [ ] **V2-10**: IP address displays on OLED after WiFi connection.

---

## Exit Criteria

Phase 2 is **complete** when:
1. All four sensors (DHT22, PIR, MQ2, LDR) report data through the full pipeline.
2. Edge-local gas safety alert works without network connectivity.
3. User authentication protects API endpoints.
4. Historical data is queryable and at least one chart renders on the Dashboard page.
5. WiFiManager provisioning flow works end-to-end.
