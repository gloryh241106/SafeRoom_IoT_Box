# UNIVERSITY OF SCIENCE, VNU-HCM

## FACULTY OF INFORMATION TECHNOLOGY

### PHYSICS FOR INFORMATION TECHNOLOGY

<br>

# FINAL PROJECT REPORT

## SafeRoom IoT Box

### Indoor Monitoring and Safety Alert System

<br>

**Project Group:** Group 6<br>
**Semester:** HK3/2025-2026

<br>

| Student | Student ID |
|---|---:|
| Phùng Bảo Khang | 24127052 |
| Thái Kiệt | 24127069 |
| Nguyễn Huy Hoàng | 24127378 |

<br>

**Instructor:** Cao Xuân Nam

<br>

**Ho Chi Minh City, August 2026**

---

## 2.2. Product Function List

According to the final-report rules, the group may add, remove, or update no more than one function compared with the original project proposal. The product retains all 12 registered functions. No function has been added or removed. **NC-02 is declared as the single updated function** because its local gas-alert threshold can now be configured from the Settings page and synchronized to the ESP32 through MQTT. This update extends the original implementation while preserving the registered purpose of NC-02.

Hardware-dependent behavior is described according to the current design and source code. It must only be presented as experimentally verified after the group attaches the corresponding TC-01 to TC-06 evidence.

| ID | Function and processing flow | Assigned student | Change from the proposal |
|---|---|---|---|
| **Basic functions** |  |  |  |
| **CB-01** | **Temperature and humidity measurement.** The DHT22 measures room temperature and humidity. The ESP32 publishes validated telemetry through MQTTS to EMQX. The Express.js backend validates and stores the readings in MongoDB, and the Overview page retrieves the latest snapshot through the REST API. | **Nguyễn Huy Hoàng** | **No change.** The registered end-to-end input-to-web flow is preserved. |
| **CB-02** | **Motion detection.** The ESP32 reads the HIGH/LOW output of the PIR HC-SR501, includes the motion state in telemetry, and publishes it through EMQX. The Overview page displays whether motion is currently detected. | **Phùng Bảo Khang** | **No change.** The registered motion-monitoring flow is preserved. |
| **CB-03** | **Website-based fan control.** A user switches the fan on or off from the Overview page. The backend publishes the command to <code>safebox/{deviceId}/control</code>; the ESP32 receives it and switches the HL-52S relay. The buzzer and red alert LED are local safety outputs and cannot be controlled remotely. | **Thái Kiệt** | **No change.** The registered remote output is the fan only. |
| **Advanced functions** |  |  |  |
| **NC-01** | **Z-score anomaly detection.** The backend maintains an isolated rolling baseline of 30 previous samples for each device and continuous metric. When Automatic Mode is enabled, Z-score detection is applied only to temperature and humidity. The default limit is &#124;Z&#124; > 3.0 and can be configured in Settings. A minimum physical delta filters low-variance noise. Gas and motion use hard rules instead of Z-score. Accepted events are recorded in <code>anomaly_logs</code>, with a short deduplication window to suppress rapid duplicates. | **Thái Kiệt** | **No change.** This remains the registered self-built data-analysis function. |
| **NC-02** | **Local gas/smoke detection and warning.** The MQ-2 is represented as a raw 12-bit ADC index from 0 to 4095, not as uncalibrated PPM. After the 30-second startup stabilization period, three consecutive samples above the active alarm threshold trigger the buzzer, red LED, and OLED warning locally in approximately 150 ms without waiting for the network. The current source default is 1200 ADC, with a clear threshold of 1100 ADC. Settings can update the threshold, and the backend publishes the latest alarm/clear pair to <code>safebox/{deviceId}/config</code> as retained MQTT configuration. The ESP32 still performs every safety decision locally. | **Nguyễn Huy Hoàng** | **Updated.** Added user-configurable gas thresholds synchronized from the web backend to the ESP32; the original local warning function is unchanged. |
| **NC-03** | **Time-based sensor and activity storage.** MongoDB Atlas stores telemetry in the <code>sensor_readings</code> Time Series collection, using <code>timestamp</code> as the <code>timeField</code>, <code>deviceId</code> as the <code>metaField</code>, second-level granularity, and a 30-day retention period. The standard <code>anomaly_logs</code> collection stores anomaly history. | **Thái Kiệt** | **No change.** The registered cloud time-series storage function is preserved. |
| **NC-04** | **Historical web charts.** The Dashboard queries MongoDB data through the backend and provides 1-hour, 6-hour, 24-hour, and 7-day selectors for temperature, humidity, and raw gas charts. Each request displays at most the newest 1,000 readings within the selected period. The page also provides Refresh and CSV Export actions. | **Phùng Bảo Khang** | **No change.** The registered cloud-to-chart function is preserved. |
| **NC-05** | **Automatic email alerts.** When SMTP is configured, the backend sends Nodemailer alerts for HIGH or CRITICAL anomalies to registered accounts that have not disabled email notifications. Repeated successful deliveries are limited to one email per 15-minute window for each <code>(deviceId, sensorType)</code> pair. | **Thái Kiệt** | **No change.** The registered email-notification function is preserved. |
| **NC-06** | **System query chatbot.** A conditional keyword router implemented in Express.js accepts queries about <code>status</code>, <code>gas</code>, <code>motion</code>, <code>temperature</code>, <code>humidity</code>, <code>anomalies</code>, and <code>help</code>. It retrieves the corresponding system data and returns a response to the React Chatbot page. No external language model is used. | **Phùng Bảo Khang** | **No change.** The registered conditional chatbot is preserved. |
| **NC-07** | **Account registration and login.** React sends registration and login requests to Express.js. The backend validates input, stores bcrypt password hashes in MongoDB, verifies credentials, issues JWTs, and protects business API prefixes with authentication middleware. | **Nguyễn Huy Hoàng** | **No change.** The registered database-backed authentication function is preserved. |
| **NC-08** | **Custom product-management website.** The React, Vite, and Tailwind CSS application contains Login, Register, Overview, Dashboard, Chatbot, and Settings pages. It communicates with the Express.js backend through authenticated REST APIs, and Overview polls live telemetry every three seconds. | **Phùng Bảo Khang** | **No change.** The registered custom website remains within its original scope. |
| **NC-09** | **Device WiFi provisioning.** If no saved network is available, WiFiManager opens the <code>Safebox-AP</code> captive portal at <code>192.168.4.1</code>. The user selects a 2.4 GHz WiFi network, the ESP32 stores the credentials in NVS, reconnects, and displays the connected SSID and IP address on the OLED. | **Nguyễn Huy Hoàng** | **No change.** The registered WiFiManager provisioning function is preserved. |

## 2.3. Product Photographs

All figures in this section must use photographs of the physical product or captures of the complete Wokwi circuit. Replace every evidence placeholder below before submitting the final PDF.

### Figure 1. Complete SafeRoom IoT Box

> **REQUIRED BEFORE SUBMISSION:** Insert a clear photograph showing the enclosure, OLED, DHT22 sampling area, PIR HC-SR501, MQ-2, DC fan, and red alert LED.

**Visible components:**

1. **SSD1306 0.96-inch OLED:** displays network information and local gas warnings.
2. **DHT22:** measures room temperature and humidity.
3. **PIR HC-SR501:** detects motion.
4. **MQ-2:** provides the raw gas/smoke ADC index.
5. **DC fan:** switched from the website through the relay.
6. **Red LED:** indicates an active local gas alarm.
7. **Buzzer:** sounds while the local gas safety alarm is active.

If a green LED is physically wired directly to the power rail, label it only as a **power indicator**. It is not controlled by the current firmware and must not be described as a network-status LED.

### Figure 2. Internal Wiring and ESP32 Controller

> **REQUIRED BEFORE SUBMISSION:** Insert a photograph that clearly shows the ESP32 DevKit V1, power wiring, shared ground, I2C bus, sensor signals, and actuator-control wiring.

**Authoritative pinout:**

- **GPIO 4:** DHT22 data.
- **GPIO 13:** PIR HC-SR501 output.
- **GPIO 34:** MQ-2 analog output (<code>ADC1_CH6</code>).
- **GPIO 16:** fan relay signal.
- **GPIO 18:** red alert LED.
- **GPIO 19:** active buzzer.
- **GPIO 21/22:** OLED I2C SDA/SCL.

### Figure 3. HL-52S Relay and DC Fan Assembly

> **REQUIRED BEFORE SUBMISSION:** Insert a photograph showing the relay signal connected to GPIO 16, the external fan supply, and the common ground. The fan must not be powered from an ESP32 GPIO pin.

### Figure 4. Local Gas-Alarm State

> **REQUIRED BEFORE SUBMISSION:** Insert a photograph showing the OLED gas warning, illuminated red LED, and active buzzer. Include the raw ADC reading and active threshold where possible. A timer or TC-03 video frame should demonstrate that the offline response occurs within the required 200 ms after confirmation begins.

## 2.4. Website Screenshots

Every figure must identify the demonstrated function. Replace all placeholders with screenshots from an actual running session before submitting the final PDF.

### Figure 5. Login Page - NC-07

> **REQUIRED BEFORE SUBMISSION:** Insert a screenshot showing the username-or-email field, password field, validation result, and Register link.

### Figure 6. Registration Page - NC-07

> **REQUIRED BEFORE SUBMISSION:** Insert a screenshot showing the username, email, password fields, and a successful account-creation result.

### Figure 7. Overview Page - CB-01, CB-02, CB-03, NC-01, and NC-02

> **REQUIRED BEFORE SUBMISSION:** Insert a screenshot containing real telemetry: temperature, humidity, raw gas ADC index, motion, MQTT/device connection state, fan state, and recent anomalies. Label the fan control as CB-03. Do not describe the buzzer or red LED as remotely controllable.

### Figure 8. Dashboard Page - NC-03 and NC-04

> **REQUIRED BEFORE SUBMISSION:** Insert a screenshot showing the Temperature, Humidity, and Raw Gas charts; the 1h/6h/24h/7d selector; Refresh; and Export CSV. State that each query is capped at 1,000 readings.

### Figure 9. Chatbot Page - NC-06

> **REQUIRED BEFORE SUBMISSION:** Insert a screenshot containing at least one user question and its corresponding response, such as a system-status query or the current raw gas reading.

### Figure 10. Settings Page - NC-01, NC-02, NC-05, and NC-07

> **REQUIRED BEFORE SUBMISSION:** Insert a screenshot showing account information, password change, email-notification preference, safety thresholds, the current firmware gas threshold, and the Automatic Mode switch for Z-score detection.

### Verification Evidence Checklist

| Test | Required evidence | Current review status |
|---|---|---|
| **TC-01 - WiFi Provisioning** | Photograph/video of <code>Safebox-AP</code>, <code>192.168.4.1</code>, saved credentials after reboot, and OLED SSID/IP. | **Hardware evidence required.** |
| **TC-02 - Telemetry Pipeline** | Timestamped ESP32, EMQX, backend, and MongoDB evidence showing the 2-second telemetry flow. | **Live infrastructure evidence required.** |
| **TC-03 - Edge Safety Autonomy** | Timed offline test showing the buzzer, red LED, and OLED response in under 200 ms after confirmation begins. | **Hardware measurement required.** |
| **TC-04 - Z-score Engine** | Thirty-sample baseline followed by a temperature spike, resulting anomaly record, and frontend alert. | **Backend logic tests pass; live evidence required.** |
| **TC-05 - Nodemailer** | Delivered HIGH/CRITICAL email in under 5 seconds and proof that a repeat is throttled for 15 minutes. | **Automated email/throttle tests pass; live SMTP evidence required.** |
| **TC-06 - Remote Fan Override** | Website action and timed relay response below 500 ms. | **Authenticated mock CB-03 flow passes; hardware timing evidence required.** |

**Latest software verification snapshot:**

- Backend full suite: **53/53 tests passed**.
- Focused Thái Kiệt suite: **44/44 tests passed**, followed by **CB-03 PASS**.
- Frontend production build: **passed**; Vite reported a non-blocking JavaScript bundle-size warning.
- Firmware build: **not verified in the current review environment** because the PlatformIO <code>pio</code> command was unavailable.

## 2.5. Student Self-Assessment

The table below follows the function assignments in the proposal. The advanced-function score is capped at 4.0 points per student. The totals assume a comprehension coefficient of **K = 100%**; the official score remains subject to each student's oral-defense performance under the course formula:

**Final Project Score = (Basic Function Score + Teamwork Score + Advanced Function Score + Report Score) x K**

| No. | Student | Basic functions | Advanced functions | Teamwork | Final report | Provisional total |
|---:|---|---:|---:|---:|---:|---:|
| 1 | **Phùng Bảo Khang** | 4.0 | 4.0 | 1.0 | 1.0 | **10.0** |
| 2 | **Thái Kiệt** | 4.0 | 4.0 | 1.0 | 1.0 | **10.0** |
| 3 | **Nguyễn Huy Hoàng** | 4.0 | 4.0 | 1.0 | 1.0 | **10.0** |

**Assignment basis:**

- **Phùng Bảo Khang:** CB-02; NC-04, NC-06, and NC-08.
- **Thái Kiệt:** CB-03; NC-01, NC-03, and NC-05.
- **Nguyễn Huy Hoàng:** CB-01; NC-02, NC-07, and NC-09.

**Required final PDF filename:** <code>06_24127052_24127069_24127378_FINAL.PDF</code>.
