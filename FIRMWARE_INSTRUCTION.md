# SafeRoom IoT Box — Firmware Wiring & Build Guide

Step-by-step guide to connect all sensors/actuators to the ESP32 DevKit V1,
flash the firmware, and provision WiFi. Pin numbers are authoritative and come
from `firmware/src/config.h`.

---

## 1. Tools & Components

| # | Component | Qty | Notes |
|---|-----------|-----|-------|
| 1 | ESP32 DevKit V1 (30-pin, WROOM-32) | 1 | 3.3 V logic, ADC and I2C built in |
| 2 | DHT22 (AM2302) temperature/humidity | 1 | Single-wire digital bus |
| 3 | PIR HC-SR501 motion sensor | 1 | Digital output; 3.3–5 V supply |
| 4 | MQ2 gas/smoke sensor breakout | 1 | Analog output; needs 5 V for the heater |
| 5 | SSD1306 128×64 OLED (I²C) | 1 | I²C address 0x3C |
| 6 | Active buzzer module (3-pin: SIG/VCC/GND) | 1 | Built-in oscillator; digital ON/OFF control |
| 7 | Red 5 mm LED | 1 | Alert LED |
| 8 | Green 5 mm LED | 1 | Status LED |
| 9 | Relay module (HL-52S) | 1 | Drives the DC fan; active-low input (IN LOW = ON) |
| 10 | 5 V DC fan (< 2 A) | 1 | Powered externally, NOT from GPIO |
| 11 | 220–330 Ω resistors | 2 | LED current limiters |
| 12 | 4.7–10 kΩ resistor | 1 | DHT22 DATA pull-up |
| 13 | Breadboard + jumper wires (male/male, male/female) | — | |
| 14 | Micro-USB cable + PC with PlatformIO | 1 | For flashing & serial monitor |
| 15 | Normally-open momentary push button (2-pin or dry-contact module) | 1 | External hardware reset; connect EN/RST to GND while pressed |

---

## 2. Safety Rules (read first)

1. **Never power the fan or any high-current load from an ESP32 GPIO pin.**
   The relay output side and fan must use a separate 5 V supply; GPIO 16 only
   drives the relay input.
2. GPIO 34 is an **input-only** pin on the ESP32 (no internal pull-up/pull-down).
   The MQ2 AO connection **must** use the 15 kΩ / 10 kΩ divider in Step 5.
3. Do not feed **5 V into any GPIO** (including sensor outputs). If a 5 V
   module outputs > 3.3 V on its signal pin, add a voltage divider first.
4. Common ground: the ESP32 GND must be shared with every module, the relay,
   and the fan power supply.
5. Verify each connection with the chip **unpowered**; double-check polarity on
   LEDs, the buzzer, and the relay before plugging in USB.
6. A new or long-stored MQ2 needs the manufacturer's initial preheat period in
   clean air. This firmware reports a relative ADC index, never an uncalibrated
   PPM value, and does not track preheat progress in software.
7. Use only a **normally-open momentary** contact for reset. Do not use a
   latching switch, connect EN/RST to 5 V, or hold EN/RST low continuously.

---

## 3. Power Distribution

- **ESP32 3.3 V pin** → DHT22, PIR, OLED, 3.3 V buzzer module, LEDs.
- **ESP32 5 V pin (VIN)** → MQ2 breakout heater input, relay module input.
- **External 5–12 V supply** → relay COM/DC-in and fan power (common ground to
  ESP32). The relay module's input side can stay on 3.3–5 V logic.
- USB 5 V rail of the DevKit is used for the ESP32 itself and low-current
  periphery during bring-up; for the fan test use the external supply.

  ```text
        +---------+      3V3 rail         +---------+
  USB   |         |----+----------------->| sensors |
  5V -->| ESP32   |----|----------------->| OLED    |
        | DevKit  |    |                  | buzzer  |
        |         |----+--> 5V rail ----->| MQ2 / module  |
        |         |    GND ( common ) <---| relay / fan   |
        +---------+
  ```

---

## 4. Step-by-Step Wiring

Complete the steps in order; after each step reference the expected check.

> **30-pin ESP32 DevKit V1 layout** — all project pins exist on this board.
> The two 15-pin columns read top→bottom. Pins marked **RX2/TX2** on the
> silkscreen (GPIO 16/17) are plain GPIOs that also serve a UART; they are
> safe for the relay and LED here.

| Project role | GPIO | Physical location (30-pin DevKit V1) |
|--------------|------|--------------------------------------|
| DHT22 data | 4 | right column, 5th pin (top→bottom) |
| PIR OUT | 13 | left column, 13th pin (just above GND) |
| MQ2 analog | 34 | left column, 4th pin |
| Relay IN | 16 (RX2) | right column, 6th pin |
| Green LED | 17 (TX2) | right column, 7th pin |
| Red LED | 18 | right column, 9th pin |
| Buzzer | 19 | right column, 10th pin |
| OLED SDA | 21 | right column, 11th pin |
| OLED SCL | 22 | right column, 12th pin |
| Hardware reset | EN/RST ↔ GND | pins labeled `EN` (or `RST`) and `GND`; location varies by DevKit revision |
| 3.3 V rail | 3V3 | right column, 1st & 15th pins |
| GND | GND | right column, 2nd & 14th; left column 14th |
| 5 V input | VIN | left column, 15th pin (bottom) |

### Step 1 — Power rails

1. Plug a jumper from **VIN → breadboard 5 V rail**.
2. Plug a jumper from **3.3 V → breadboard 3.3 V rail**.
3. Plug a jumper from **GND → breadboard GND rail**.
4. Connect the **external DPS/GND** for the fan/relay when the module is added.

### Step 2 — SSD1306 OLED (I² C) → GPIO 21 / 22

| OLED pin | ESP32 pin |
|----------|-----------|
| VCC | 3.3 V |
| GND | GND |
| SDA | GPIO 21 (`config.h` `PIN_OLED_SDA`) |
| SCL | GPIO 22 (`config.h` `PIN_OLED_SCL`) |

- Connect `Wire` pins exactly as above; address 0x3C is defined in
  `config.h`.
- **Check (TC-01)**: after flashing, the OLED shows "SafeRoom IoT Box /
  Booting...". If blank, swap SDA/SCL or check the I²C address.

### Step 3 — DHT22 → GPIO 4

| DHT22 | ESP32 |
|-------|-------|
| VCC (pin 1 / left on module) | 3.3 V |
| DATA (center) | GPIO 4 (`DHT22_PIN`) |
| NC | — |
| GND (right) | GND |

- Place a **4.7–10 kΩ pull-up between DATA and 3.3 V**.
- **Check**: serial log prints no DHT error; telemetry starts reporting
  `temperature` / `humidity` in sane ranges (see §8).

### Step 4 — PIR HC-SR501 → GPIO 13

| PIR | ESP32 |
|-----|-------|
| VCC | 3.3 V (or 5 V) |
| OUTPUT | GPIO 13 (interrupt-capable GPIO; `PIR_PIN`) |
| GND | GND |

- Set the **sensitivity/delay trimmer** near minimum for a responsive demo and
  choose the module's repeat mode according to the desired physical behavior.
- Firmware does not add a software latch. Each telemetry snapshot copies the
  direct GPIO 13 level, so `motionDetected` remains true only while the
  HC-SR501 OUT pin itself is HIGH.
- **Check**: move your hand; telemetry `motionDetected` follows the module OUT
  pin without an extra 10-second hold from firmware.

### Step 5 — MQ2 gas sensor (analog) → GPIO 34

| MQ2 breakout | Connection |
|--------------|------------|
| VCC | ESP32 5 V / VIN |
| GND | Common GND |
| AO | 15 kΩ resistor to GPIO 34; 10 kΩ from GPIO 34 to GND |
| DO | Leave unused |

- **Required voltage divider**: do not connect a possible 5 V AO signal
  directly to the ESP32 ADC. The firmware reports the divided GPIO 34 reading
  as a raw ADC index and does not reverse-calculate module voltage or PPM.

  ```
  MQ2 AO ── 15 kΩ ──●── GPIO 34 (ADC1_CH6)
                    │
                   10 kΩ
                    │
                   GND
  ```

- The firmware explicitly selects 12-bit ADC resolution, calls
  `analogRead(GPIO34)` once per sample, and reports that direct **raw ADC count
  (0–4095)** as both `gasLevel` and `gasRaw`.
- There is no PPM interpolation, boot calibration, median filter, EMA, or
  software warm-up delay. The manufacturer's initial preheat requirement of
  at least 48 hours still applies to meaningful physical measurements.
- Firmware raises a local alarm above `600`. Once active, the alarm clears
  only below `500`; this
  hysteresis prevents buzzer/LED chatter around the trigger boundary. Tune
  these raw project thresholds only after logging clean-air and safe test-smoke
  readings on the assembled hardware; do not relabel them as PPM.
- **Check**: `gasValid=true` means the firmware task has acquired a sample, and
  `gasLevel` equals `gasRaw`; it is not an electrical health diagnosis. Natural
  fluctuations are expected because the value is unfiltered.

### Step 6 — Active buzzer module → GPIO 19 (digital signal)

| Active buzzer module | ESP32 |
|----------------------|-------|
| `S`, `SIG`, or `IN` | GPIO 19 (`BUZZER_PIN`) |
| `+` or `VCC` | 3.3 V — the module is powered at 3.3 V so its low-trigger input is fully OFF at the GPIO's 3.3 V HIGH level (verified on hardware). A 5 V supply also works but then the module needs the NPN driver stage below to reach a real 5 V OFF level |
| `-` or `GND` | GND |

- The active buzzer module contains its own oscillator. Firmware enables its
  signal pin digitally while a gas alarm is active; it does not generate a
  2 kHz LEDC tone.
- The module is **low level trigger** (active-LOW): SIG LOW means ON. Powered
  at 3.3 V, GPIO 19 HIGH (3.3 V) fully turns it OFF, so `config.h` sets
  `BUZZER_ACTIVE_LOW=true` and SIG is wired directly to GPIO 19. Never connect
  5 V directly to GPIO 19.
- If a louder 5 V supply is preferred, drive SIG through an NPN driver stage
  (GPIO 19 → 1 kΩ → base, emitter → GND, collector → SIG, 10 kΩ pull-up
  SIG → 5 V), which inverts the logic and requires `BUZZER_ACTIVE_LOW=false`.
- Firmware suppresses alarm decisions for the first 30 s while the cold MQ2
  heater settles (readings are published as `gasValid=false` during that
  window), then requires three consecutive 50 ms MQ2 samples above 600 before
  enabling the buzzer. The alarm clears after three samples below 500, or after
  5 s sustained below 600, so an oscillating clean-air baseline cannot keep the
  buzzer stuck on.
- If the buzzer clicks before `setup()` starts, add a **10 kΩ pull-up from SIG
  to 3.3 V**. Do not pull SIG up to 5 V because ESP32 GPIOs are not 5 V tolerant.
- **Pending physical check (TC-03)**: measure buzzer + red LED + OLED "GAS!"
  response below 200 ms both offline and while Save WiFi/MQTTS is busy. Firmware
  now samples and actuates from a pinned priority-4 FreeRTOS task, so synchronous
  network calls are outside the time-critical path; a successful build is not a
  substitute for the oscilloscope/video timing measurement.

### Step 7 — LEDs → GPIO 17 & 18

| LED | Anode | Cathode | ESP32 signal |
|-----|-------|---------|--------------|
| Green (status) | via 220–330 Ω → GPIO 17 | GND | `STATUS_LED_PIN` |
| Red (alert) | via 220–330 Ω → GPIO 18 | GND | `ALERT_LED_PIN` |

- Wire like: `GPIO17 → Resistor → LED an → LED cath → GND`. HIGH = on.
- **Check**: green LED is on when WiFi connected; red LED (and buzzer) turn on
  only while the local gas alarm is active — they are edge-only outputs with no
  remote web control.

### Step 8 — DC Fan / HL-52S Relay → GPIO 16

The **HL-52S** is a 2-channel relay module with **5 V coils** and **active-LOW
inputs** (IN LOW → relay energized). It has separate `VCC`, `JD-VCC`, `GND`,
`IN1`, `IN2` pins and a small **VCC–JD-VCC jumper**.

Recommended wiring (3.3 V logic compatible):

| HL-52S pin | Connect to |
|------------|-----------|
| VCC | ESP32 **3.3 V** (logic side of the optocoupler) |
| JD-VCC | **External 5 V** coil supply (see note below) |
| GND | ESP32 GND (common ground) |
| IN1 | GPIO 16 (`FAN_RELAY_PIN`) |
| IN2 | leave unconnected (second channel unused) |
| COM1 | fan power supply **+** |
| NO1 | fan **+** |
| fan − | fan power supply **−** |

**JD-VCC jumper note**: with the jumper in place, the coil shares VCC. If you
feed 5 V to VCC, the ESP32's 3.3 V HIGH may not fully cut off the optocoupler
(relay can stay latched / chatter). Best practice for a 3.3 V MCU:
1. **Remove the VCC–JD-VCC jumper.**
2. VCC → 3.3 V (logic/optocoupler side).
3. JD-VCC → external 5 V (coil side, common the two grounds).

The firmware defaults to **active-low** (`config.h` `FAN_RELAY_ACTIVE_LOW = true`), so
`setFan(true)` pulls GPIO 16 LOW and energizes the coil; boot writes HIGH, keeping
the relay open (fan off).

- **Check (TC-06)**: toggling the fan on the Overview page flips IN1 level and
  you hear the relay click / the fan spins within ~500 ms.

### Step 9 — External hardware reset button → EN/RST & GND

Use a **normally-open momentary push button** so the reset circuit is open
during normal operation. The ESP32 DevKit already has an onboard `EN` button;
the external button is useful when that button is inaccessible inside the box.

| Reset button contact | ESP32 pin |
|----------------------|-----------|
| Contact 1 | `EN` or `RST` (use the board silkscreen label) |
| Contact 2 | `GND` |

```text
EN/RST ──── normally-open push button ──── GND
```

- No GPIO assignment, VCC connection, pull resistor, or firmware handler is
  required. Pressing the button pulls EN low and resets the chip in hardware,
  so it still works if firmware, WiFi, or MQTT is hung.
- Prefer a plain 2-pin button or a module that exposes a voltage-free
  normally-open contact. Do not connect an unknown powered 3-pin `S/VCC/GND`
  button module directly to EN/RST without first verifying its schematic.
- Hold for about 100 ms, then release. The ESP32 boots from the start and all
  actuators return to their firmware-defined boot state.
- **Check**: with the serial monitor open, press and release the external
  button. The boot banner must appear again and the OLED must show the boot /
  provisioning status. If gas remains above threshold, edge safety will
  re-activate the alarm after startup.

---

## 5. Final Check

Power off, then with the multi-meter/period pressing your jumper order:

- [ ] No shorts between 3.3 V / 5 V / GND rails.
- [ ] Each signal pin lands on the same number marked in §4.
- [ ] DHT22 pull-up wire in place.
- [ ] OLED address + I²C pins 21/22 ok.
- [ ] Relay NO/COM not shorted to the logic side.
- [ ] Reset button is normally open and connects only EN/RST to GND when pressed.

---

## 6. Firmware Flashing

```bash
cd firmware
pio run                     # build
pio run --target upload     # flash the ESP32 via USB
pio device monitor          # serial monitor (115200)
```

First-time build signs in lib deps in `platformio.ini`.

### Secrets

Use `firmware/include/secrets.example.h` → copy to `firmware/include/secrets.h`:

```cpp
#define DEVICE_ID "safebox-01"                     // must match backend DEVICE_ID
#define MQTT_BROKER_HOST "your-emqx-host"
#define MQTT_BROKER_PORT 8883
#define MQTT_USERNAME "…"
#define MQTT_PASSWORD "…"
#define MQTT_CA_CERT "…PEM…"
```

Router credentials are NOT compiled; they are provisioned at runtime through
the captive portal (§8). For a simple coursework demo, `Safebox-AP` uses the
fixed password `12345678`, declared once as `WIFI_AP_PASSWORD` in
`firmware/src/config.h`. This fixed credential must be changed before
using the design outside a controlled classroom environment.
`secrets.h` is git-ignored—never commit it.

---

## 7. Cloud Services Setup — MongoDB Atlas & EMQX

The full telemetry path is ESP32 → EMQX broker → backend → MongoDB. Two free
cloud services must be provisioned before the box can go live:

| Cloud service | Role | Where the credentials land |
|---------------|------|----------------------------|
| **MongoDB Atlas** (M0 free tier) | Stores telemetry, anomaly logs, users | `backend/.env` → `MONGO_URI` |
| **EMQX Cloud Serverless** (free quota) | MQTT broker: ESP32 ↔ backend | `firmware/include/secrets.h` **and** `backend/.env` |

Do the two hardsetup sections in order; both end with a "check" you can verify
before moving on.

### Step 1 — MongoDB Atlas (storage)

1. Sign in at <https://cloud.mongodb.com> (create a MongoDB account if needed).
2. Create a **Project** (e.g. `Safebox`) and add the team members.
3. Click **Build a Database** → select **M0 Sandbox (free)** →
   choose a close region (e.g. us-east-1) → **Create Deployment**.
4. Under **Database Access → Add New Database User**:
   - Username: e.g. `safebox_user`
   - Authentication method: **Password** (auto-generate or type your own)
   - Role: **Read and write to any database**
   - Copy the username+password somewhere safe.
5. Under **Network Access → Add IP Address**:
   - For a school/lab demo choose **Allow access from anywhere
     (`0.0.0.0/0`)** (or limit it to your IP).
6. Click **Connect → Drivers** and copy the connection string
   (`mongodb+srv://…`). It looks like:

   ```text
   mongodb+srv://safebox_user:<password>@cluster0.abc123.mongodb.net
   ```

7. Build the final URI by adding the database name `/safebox` and replacing
   `<password>` with the user password from step 4:

   ```text
   mongodb+srv://safebox_user:<password>@cluster0.abc123.mongodb.net/safebox
   ```

8. Put it into `backend/.env` as `MONGO_URI=…`.

**Verification**: start the backend (`npm start` in `backend/`) and check the
console prints `[MongoDB] Connected`. In Atlas → **Browse Collections** you
should see the `safebox` database appear once data flows
(`sensor_readings` time-series collection is created automatically by
`timeSeriesService.js`).

### Step 2 — EMQX Cloud Serverless (broker)

1. Sign up at <https://cloud.emqx.com> (phone verification required) and
   create your **project**.
2. Click **New Deployment → Serverless** (free quota: 1M
   session-minutes / 1 GB traffic / month — enough for this box), accept the
   terms and **Deploy**.
3. Wait until status **Running**, then open **Overview**; note the
   **connection address** (e.g. `broker-…emqxsl`…). Serverless only allows
   TLS ports: MQTTS **8883** and WSS **8084**.
4. **Download the CA certificate** (Overview → **TLS/SSL** section): the
   serverless broker uses one-way TLS, and the ESP32 must verify it with this
   PEM file.
5. **Access Control → Authentication → Add**: create a client credential
   (username + password, e.g. `safebox_esp` / your own strong password).
   This same username/password will also be used by the backend.
6. Optional smoke test: use **MQTTX** (free desktop tool, provide the CA) to
   connect `mqtts://<address>:8883` with the credential you just created.

Now fill both config files from the values you just collected:

**(a) Firmware** — `firmware/include/secrets.h`:

```cpp
#define DEVICE_ID "safebox-01"                 // must match backend .env
#define MQTT_BROKER_HOST "broker-abcxxx.emqxsl"… // host WITHOUT mqtts:// or port
#define MQTT_BROKER_PORT 8883
#define MQTT_USERNAME "safebox-esp"
#define MQTT_PASSWORD "…your password…"
#define MQTT_CA_CERT \                // paste the PEM downloaded in step 4
    "-----BEGIN CERTIFICATE-----\n"
    "…\n"
    "-----END CERTIFICATE-----\n"
```

Note: the host must give the **hostname only** (no scheme, no `:8883`).

**(b) Backend** — `backend/.env` (switch OFF mock mode):

```dotenv
MOCK_HARDWARE=false
MQTT_BROKER_URL=mqtts://broker-abc.emq…:8883
MQTT_USERNAME=safebox-esp
MQTT_PASSWORD=…
MQTT_CLIENT_ID=safebox_backend
MQTT_TLS_REJECT_UNAUTHORIZED=true
DEVICE_ID=safebox-01
```

### Step 3 — Consistency checklist before flashing

- [ ] `DEVICE_ID` identical in `backend/.env` and `include/secrets.h`
- [ ] Backend broker URL starts with `mqtts://` (enforced by
      `mqttService.js`)
- [ ] ESP32 uses `8883` + full CA PEM; backend keeps
      `MQTT_TLS_REJECT_UNAUTHORIZED=true`
- [ ] Same `MQTT_USERNAME`/`MQTT_PASSWORD` usable by both clients (create a
      second credential in EMQX if you prefer separate identities)
- [ ] `MONGO_URI` points at `/safebox` and the user has write access

### Expected cloud behavior on first boot

- ESP32: `[MQTT] Connected` appears after a successful session; verify the
  2-second telemetry on EMQX/Atlas because the simplified firmware does not log
  every publish.
- Backend: `[MQTT] Connected and subscribed to telemetry, alerts, and status
  topics.` appears; verify inserts in MongoDB rather than expecting a log line
  for every message.
- EMQX Overview: **2 clients** connected (ESP32 + backend)

---

## 8. Provisioning, Runtime Network Switching & First Boot (TC-01)

1. Flash and power the board. Sensor/edge-safety updates begin immediately;
   station connection is not allowed to own a 30-second boot wait.
2. ESP32 tries the latest router credentials saved in NVS. If that attempt
   fails, WiFiManager opens **SoftAP `Safebox-AP`** at `192.168.4.1`.
3. Connect a phone/PC to `Safebox-AP` with password `12345678`, open
   `http://192.168.4.1`, select the
   office/test router, enter its password, and save.
4. WiFiManager writes the router credentials to NVS and ESP32 joins the new
   network **without rebooting**. A direct network-A → network-B switch closes
   the old MQTT/TLS socket before reconnecting through the new station IP.
5. OLED shows the current station SSID/IP when connected; the green LED follows
   station connectivity. The setup AP closes after a successful save.
6. The device publishes `safebox/{id}/status` `{"status":"online"}` (QoS 0,
   retained); its offline LWT is QoS 1 retained. Inspect EMQX/Atlas to confirm
   two-second telemetry.
7. Power-cycle the box and verify the last selected router is loaded from NVS.
   If that router is unavailable, verify `Safebox-AP` appears again.

The standard WiFiManager portal is processed from the normal Arduino loop by
calling `_manager.process()`. Saving an SSID and making an MQTTS connection can
still block `loopTask`, but the independent priority-4 MQ2 task directly owns
ADC sampling, buzzer/LED arbitration, and the serialized OLED transition.
TC-03 must still measure this exact scenario on hardware.

---

## 9. Verification checklist per sensor/actuator (TC mapping)

| TC | What to check | Indicator |
|----|---------------|-----------|
| TC-01 | Saved WiFi fails → setup AP → NVS save → OLED IP | `Safebox-AP` uses `12345678`; router persists across reboots |
| TC-02 | 2 s telemetry to EMQX → MongoDB | `pio device monitor` shows publishes; backend stores docs |
| TC-03 | Offline gas breach < 200 ms (WiFi off) | buzzer + red LED + "GAS!" OLED, no network |
| TC-04 | Temp spike → Z-score AnomalyLog + alert | dashboard anomaly panel shows the log |
| TC-05 | Email on CRITICAL alert, 15-min debounce | inbox ≤ 5 s of first alert, no duplicates |
| TC-06 | Fan toggle on web → relay clicks | relay + fan respond within ~500 ms |

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| OLED stays black | I²C wiring/address not 0x3C, or `begin()` fails silently | Recheck SDA/SCL; test an I²C scan sketch (expect 0x3C) |
| DHT reads NaN | Missing pull-up; wrong data pin | Add pull-up; verify GPIO 4 |
| Gas is fixed at 0 | AO wiring/divider fault, missing common ground, or genuinely minimum ADC input | Recheck the 15 kΩ / 10 kΩ divider, common ground, and GPIO 34; `0` is a legal ADC value, not an automatic fault flag |
| Suspected gas sensor fault | AO open/short, wrong divider, or implausibly fixed ADC | Rewire the required divider and verify with a meter; `gasValid` only means a sample was acquired |
| Saved SSID ends in `_5G`; device remains offline | Original ESP32 supports 2.4 GHz WiFi only | Join `Safebox-AP` with `12345678`, then select the router's 2.4 GHz SSID |
| No `Safebox-AP` | ESP32 is already connected to its saved router, firmware is not running, or SoftAP failed | Check the OLED/Serial log first; if WiFi is already connected the setup AP is intentionally closed |
| Fan not switching | Relay module logic mismatch (HL-52S is active-low) | keep `config.h` `FAN_RELAY_ACTIVE_LOW = true`; check the JD-VCC jumper (see Step 8) |
| Serial only shows boot | `SAFEBOX_DEBUG=0` | Build with `-DSAFEBOX_DEBUG=1` |
| No `[MQTT] Connected.` | Wrong host/port/creds in `secrets.h` | Recheck §7 Step 2; test with MQTTX first |
| MQTTS TLS handshake fail | Missing/wrong CA PEM; port not 8883 | Re-download CA from EMQX overview; paste full PEM incl. BEGIN/END |
| Backend `MQTT_BROKER_URL` rejected | URL lacks `mqtts://` or creds missing | `MOCK_HARDWARE=false` requires `mqtts://` + username/password (see §7) |
| MongoDB auth/network error | URI password wrong or IP not whitelisted | Check `MONGO_URI`, replace escaped chars, add `0.0.0.0/0` in Network Access |
| Backend log absent / memory collection | Still in mock mode | Set `MOCK_HARDWARE=false` and restart backend |
| External reset has no effect | Wrong pin or button is not normally open | Verify the board's `EN`/`RST` silkscreen and continuity to GND only while pressed |
| ESP32 stays in reset / will not boot | EN/RST is held low by a latching or miswired module | Disconnect the module, confirm the board boots, then use a 2-pin normally-open button |

---

## Pin map summary

| GPIO | Function | Module | Direction |
|-----|----------|--------|-----------|
| 4 | DHT22 Data | temperature/humidity | input (with 4.7–10 kΩ pull-up) |
| 13 | PIR OUT | raw motion HIGH/LOW | digital input (no software latch) |
| 34 | MQ2 AO | raw 12-bit ADC count (0–4095) | analog input (ADC1_CH6) |
| 16 | Relay IN1 (HL-52S) | fan ON | output (active-low: LOW = ON; boots open) |
| 17 | Green LED | status LED | output |
| 18 | Red LED | alert LED | output |
| 19 | Active Buzzer module `SIG/IN` | alarm enable | Digital output (polarity via `BUZZER_ACTIVE_LOW`) |
| 21 | I²C SDA | OLED | I²C data |
| 22 | I²C SCL | OLED | I²C clock |
| EN/RST + GND | Hardware reset | Normally-open momentary push button | Pulls EN low only while pressed; no GPIO/code |
