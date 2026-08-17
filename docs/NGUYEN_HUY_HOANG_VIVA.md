# Cẩm nang vấn đáp phần Nguyễn Huy Hoàng

Tài liệu này bám theo proposal của nhóm và phiên bản code hiện tại của SafeRoom IoT Box. Mục tiêu là giúp Hoàng giải thích đúng phần mình phụ trách, chỉ được đúng file, nói rõ giới hạn và đưa ra bằng chứng kiểm thử.

## 1. Phạm vi phụ trách

| ID | Chức năng | Loại | Phần cần nắm chắc |
|---|---|---|---|
| CB-01 | Đo nhiệt độ và độ ẩm (DHT22) | Chức năng căn bản (4.0) | Đọc cảm biến -> gói telemetry -> MQTTS -> backend validate + lưu -> Overview hiển thị |
| NC-02 | Phát hiện và cảnh báo khí/khói tại thiết bị (MQ2) | Chức năng nâng cao | ADC thô 0-4095, FreeRTOS task ưu tiên 4, buzzer/LED/OLED cục bộ, ngưỡng runtime qua MQTT |
| NC-07 | Đăng ký và đăng nhập tài khoản | Chức năng nâng cao | bcrypt + JWT, middleware bảo vệ API, luồng login/register ở React |
| NC-09 | Cấu hình WiFi cho thiết bị | Chức năng nâng cao | WiFiManager non-blocking, captive portal Safebox-AP, NVS, OLED hiển thị IP |

Phần của Hoàng đi xuyên nhiều tầng: **phần lớn ở firmware ESP32** (CB-01, NC-02, NC-09), còn NC-07 chủ yếu ở backend + frontend. Không nên trả lời "em chỉ làm firmware". Câu trả lời chính xác hơn:

> Em phụ trách hai chức năng cảm biến và an toàn tại thiết bị trên ESP32 — đo nhiệt độ/độ ẩm bằng DHT22 và cảnh báo khí MQ2 cục bộ — cùng với cấu hình WiFi bằng WiFiManager và phần đăng ký/đăng nhập tài khoản bằng JWT trên backend. Phần của em chiếm ba chân cảm biến/đầu ra chính (GPIO 4, 34, 18, 19) và toàn bộ lớp xác thực API.

## 2. Câu giới thiệu 30 giây

> Phần của em bắt đầu từ phần cứng: DHT22 đọc nhiệt độ và độ ẩm mỗi 2 giây, MQ2 đọc chỉ số ADC thô của khí mỗi 50 ms bằng một tác vụ FreeRTOS riêng có ưu tiên 4. Khi khí vượt ngưỡng, ESP32 tự bật buzzer, LED đỏ và cảnh báo OLED ngay tại thiết bị mà không cần mạng. Dữ liệu được đóng gói thành telemetry gửi qua MQTTS lên EMQX, backend kiểm tra và lưu vào MongoDB, trang Overview thăm dò REST mỗi 3 giây để hiển thị. Ngoài ra em làm phần đăng ký/đăng nhập với bcrypt và JWT bảo vệ toàn bộ API nghiệp vụ, và phần cấu hình WiFi bằng WiFiManager với captive portal Safebox-AP.

## 3. Sơ đồ tổng thể phần Hoàng

```text
+------------------------------+
| DHT22 (GPIO 4)               |   temp + humidity
| main.cpp loop (moi 2s)       |------+
| readSensorsAndPublish()      |      |
+------------------------------+      | telemetry JSON (QoS 0)
                                      v
+--------------------------------+   +--------------------------+
| MQ2 (GPIO 34 ADC)              |   |  EMQX (MQTTS port 8883)  |
| raw 0-4095, moi 50ms           |-->|                          |
+--------------------------------+   +------------+-------------+
        |                                     |
        v                                     | subscribe safebox/+/telemetry
+--------------------------------+            v
| GasSafety FreeRTOS task        |   +---------------------------+
| uu tien 4, core 1              |   | Backend: validate + luu  |
+--------+---------------+-------+   | MongoDB sensor_readings  |
         | alarm         | EDGE_SAFETY_TRIGGER                  |
         v               +------>    +-------------+-------------+
+--------------------------------+                |
| Buzzer GPIO 19 (active-low)    |                | GET /telemetry/latest (3s)
| LED do GPIO 18                 |                v
| OLED GPIO 21/22                |   +---------------------------+
+--------------------------------+   | React Overview            |
                                     | (SafeboxManager)          |
                                     +---------------------------+

WiFiManager (NC-09): Safebox-AP 192.168.4.1 -> NVS -> main loop
/auth/register | /auth/login (NC-07): bcrypt + JWT -> Bearer token bao ve API
```

Ba ý cần nhấn mạnh:

1. **An toàn khí là cục bộ**: quyết định báo động nằm trên ESP32, không phụ thuộc mạng; mạng chỉ dùng để báo cáo lên cloud.
2. **Không bao giờ phát minh số liệu**: DHT22 hỏng thì không gửi telemetry, MQ2 đang làm nóng thì gửi `gasValid=false` — không có giá trị giả.
3. **Xác thực đặt ở tầng prefix**: backend gắn middleware bảo vệ ngay ở `server.js`, nên route không thể quên bảo vệ.

## 4. CB-01 - Đo nhiệt độ và độ ẩm

### 4.1 Luồng xử lý

1. `Dht22Sensor::read()` đọc `readTemperature()` và `readHumidity()`; nếu một trong hai là `NaN` thì coi là mẫu lỗi (`dht22_sensor.cpp`).
2. `main.cpp` gọi `readSensorsAndPublish()` mỗi `SENSOR_TELEMETRY_INTERVAL_MS = 2000 ms` (dùng `millis()`, không dùng `delay()` dài).
3. Nếu DHT22 không hợp lệ: **không publish** gói telemetry (tránh gửi số 0 giả lên backend).
4. Nếu hợp lệ: đóng gói toàn bộ snapshot (nhiệt độ, độ ẩm, khí, chuyển động, trạng thái actuator) thành JSON, publish QoS 0 lên `safebox/{deviceId}/telemetry`.
5. Backend `mqttService` nhận topic → `telemetryService.validateTelemetryPayload()` → `SensorReading.create()` lưu MongoDB.
6. React Overview gọi `GET /api/v1/telemetry/latest` mỗi 3 giây để hiển thị.

### 4.2 Cấu trúc payload telemetry

```json
{
  "timestamp": 1750000000000,
  "deviceId": "safebox-01",
  "metrics": {
    "temperature": 28.4,
    "humidity": 62.1,
    "gasLevel": 132,
    "gasRaw": 132,
    "gasAlarmThreshold": 800,
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

### 4.3 Vì sao DHT22 là "bắt buộc" còn khí có thể gửi 0?

- `Telemetry::publish()` trả `false` ngay nếu `!state.sensors.dhtValid`. Lý do: nhiệt độ/độ ẩm là dữ liệu chính của CB-01, gửi giá trị giả sẽ làm sai cả biểu đồ lẫn anomaly engine.
- Khí khác: trong 30 giây làm nóng MQ2, giá trị ADC vốn nhiễu, nên gửi `gasLevel=0` kèm `gasValid=false` để backend không chạy luật khí với rác (backend có kiểm tra `gasValid` trước khi tạo anomaly).

### 4.4 Vì sao timestamp chỉ nhận sau mốc 2021?

`epochMilliseconds()` trả 0 nếu epoch < 1 609 459 200 (2021-01-01 UTC). ESP32 chưa đồng bộ NTP thì `time()` trả 1970; nếu gửi timestamp 1970 sẽ làm hỏng thứ tự Time-Series và biểu đồ. NTP phải xác nhận xong mới cho MQTTS chạy.

### 4.5 Vì sao dùng QoS 0 cho telemetry?

Telemetry là dữ liệu lặp lại mỗi 2 giây; mất một gói thì gói sau bù. QoS 0 nhẹ nhất, phù hợp PubSubClient. Lệnh điều khiển (QoS 1) và trạng thái online/offline (retained) là chuyện của CB-03 — không nhầm lẫn.

### 4.6 Thông số kỹ thuật nên nhớ

- DHT22: đo -40..80°C (sai số ±0.5°C), độ ẩm 0-100% (±2-5%), 1 dây 2 chiều, cần điện trở kéo lên (pull-up 4.7k-10k).
- GPIO 4, đọc mỗi 2 giây (DHT22 có giới hạn tốc độ tối đa ~0.5 Hz đọc tin cậy).
- `NaN` là cách thư viện báo lỗi checksum/điện áp; kiểm tra `isnan()` là chuẩn.

## 5. NC-02 - Phát hiện và cảnh báo khí/khói tại thiết bị

### 5.1 Hợp đồng ADC thô

- MQ2 nối **GPIO 34 (ADC1_CH6)**, heater 5V, tín hiệu analog.
- `Mq2Sensor::begin()`: `analogReadResolution(12)` + `analogSetPinAttenuation(pin, ADC_11db)` → giá trị **12-bit 0-4095**.
- `readRaw()` đọc **một mẫu trực tiếp**, không lọc trung bình/median/EMA, không chuyển PPM. Trong payload, `gasUnit = "adc_index"` — **tuyệt đối không nói "600 PPM"**, chỉ là chỉ số ADC thô.

### 5.2 Tác vụ an toàn FreeRTOS (`gas_safety.cpp`)

- Tạo bằng `xTaskCreatePinnedToCore`, **ưu tiên 4**, core 1, stack 4096 byte.
- Lặp `sampleOnce()` mỗi `GAS_SAMPLE_INTERVAL_MS = 50 ms` bằng `vTaskDelayUntil` (chu kỳ chính xác, không trôi).
- Task này **độc lập với WiFi/MQTT**: kể cả khi portal WiFi đang xử lý hoặc TLS đang kết nối, việc lấy mẫu và quyết định báo động vẫn chạy (TC-03).
- Chia sẻ dữ liệu giữa task và loop chính dùng `portENTER_CRITICAL`/`portEXIT_CRITICAL` (spinlock) cho ngưỡng, `_gasRaw`, `_alarm`, `_newAlert`.

### 5.3 Thuật toán báo động

| Giai đoạn | Điều kiện | Hành động |
|---|---|---|
| Làm nóng (30 s đầu) | `millis() - _startedAtMs < 30000` | Khoá mọi quyết định; `gasValid=false` trên telemetry |
| Báo động | 3 mẫu liên tiếp `raw > alarmThreshold` | Bật buzzer + LED + OLED, tạo `_newAlert` |
| Thoát | 3 mẫu liên tiếp `raw < clearThreshold` | Tắt buzzer/LED/OLED |
| Tự thoát an toàn | 100 mẫu liên tiếp `raw < alarmThreshold` (≈ 5 s) | Tắt cảnh báo dù vẫn trên clear |

- `GAS_CONFIRM_SAMPLES = 3` chống nhiễu đơn lẻ; nếu chỉ 1 mẫu cao rồi thấp thì không báo.
- Auto-clear 5 s (100 mẫu × 50 ms) đảm bảo baseline sạch dao động trong khoảng 500-600 không thể "dính" buzzer mãi.
- MQ2 lạnh lúc khởi động cho ADC gần max trong vài chục giây → nếu không có cửa sổ làm nóng 30 s, máy sẽ báo động giả ngay khi bật nguồn.

### 5.4 Ngưỡng mặc định và ngưỡng runtime

- Mặc định trong `config.h`: `GAS_ALARM_THRESHOLD_RAW = 800`, `GAS_CLEAR_THRESHOLD_RAW = 700` (clear = alarm - 100).
- Proposal ghi ngưỡng 600; thực tế ngưỡng **có thể cấu hình** từ Settings "BACKEND MQ-2 Raw ADC Max": backend publish `{gasAlarmThreshold, gasClearThreshold}` lên `safebox/{deviceId}/config` (retained, QoS 1) → `MqttService::handleConfig()` → `GasSafety::updateThresholds()`.
- `updateThresholds()` kiểm tra hợp lệ: `alarm >= 1` và `clear <= alarm`, sai thì bỏ qua (log lỗi). Quyết định vẫn 100% cục bộ, chỉ con số đổi.
- Ngưỡng đọc **một lần trong chu kỳ** (đọc vào biến local trước khi so sánh) để cấu hình đổi giữa chừng không tạo hỗn hợp alarm/clear.

### 5.5 Đầu ra cục bộ

- **Buzzer GPIO 19**: module low-trigger cấp 3.3V, `BUZZER_ACTIVE_LOW = true` — GPIO HIGH = tắt. (Đã xác minh phần cứng: mức 3.3V HIGH đủ tắt module; nếu cấp 5V thì phải thêm tầng NPN và đổi polarity.)
- **LED đỏ GPIO 18**: active-high, sáng khi alarm.
- **OLED GPIO 21/22 (I2C, 0x3C)**: `showGasWarning()` vẽ "WARNING: GAS" + giá trị ADC + ngưỡng và **chiếm quyền ưu tiên** — `showStatus()` bị bỏ qua khi `_gasWarning = true`; khi thoát, `clearGasWarning()` rồi main loop khôi phục màn hình trạng thái mạng.
- **Buzzer và LED chỉ do cảnh báo khí cục bộ điều khiển** — remote control đã bị gỡ toàn bộ (web, API, MQTT). Chỉ quạt (CB-03) mới điều khiển từ xa.

### 5.6 Thứ tự quan trọng khi báo động

```text
1. Cập nhật trạng thái alarm trong critical section
2. Ghi GPIO (buzzer/LED) — phần cứng trước
3. Vẽ OLED
4. Mới đến việc báo lên cloud (để main loop publish)
```

`publishPendingGasAlert()` trong main loop: `takeNewAlert()` lấy sự kiện → thử publish lên `safebox/{deviceId}/alerts`; nếu MQTT chưa sẵn sàng thì **thử lại mỗi 3 s** (`EDGE_ALERT_RETRY_MS`) cho tới khi gửi được — nhưng đầu ra cục bộ đã hoạt động rồi, mạng lỗi không thể tắt cảnh báo.

### 5.7 Payload alert lên cloud

```json
{
  "type": "EDGE_SAFETY_TRIGGER",
  "sensorType": "gasLevel",
  "observedValue": 812,
  "threshold": 800,
  "unit": "adc_index",
  "timestamp": 1750000000000
}
```

Backend đăng ký `safebox/+/alerts`, validate, tạo `anomaly_logs` loại `EDGE_SAFETY_TRIGGER`.

### 5.8 Vì sao phản hồi dưới 200 ms? (TC-03)

Mỗi mẫu cách nhau 50 ms; 3 mẫu liên tiếp tối đa ~150 ms. Quyết định và ghi GPIO không qua mạng, không qua heap allocation lớn. Vì vậy yêu cầu "< 200 ms khi mất WiFi" đạt được về mặt thiết kế; đo thật bằng đồng hồ/khung video vẫn đang chờ trong TC-03.

### 5.9 Giới hạn cần nói thật

- Giá trị là **chỉ số ADC thô**, không hiệu chuẩn thành PPM — không được khẳng định nồng độ khí thực tế.
- Cảnh báo dựa trên 3 mẫu liên tiếp, không phải trung bình trượt; đây là lựa chọn chống nhiễu đơn giản, có chủ đích.
- MQTT publish của PubSubClient chỉ hỗ trợ QoS 0 (alert) — backend vẫn nhận đủ vì có retry.

## 6. NC-07 - Đăng ký và đăng nhập tài khoản

### 6.1 Luồng đăng ký (`backend/routes/auth.js`)

1. Kiểm tra đủ `username`, `email`, `password` → thiếu trả 400.
2. `normalizeEmail()`: trim + lowercase + regex + giới hạn 254 ký tự → sai trả 400 (ngăn trùng email chỉ khác hoa thường).
3. Kiểm tra trùng: `User.findOne({ $or: [{ email }, { username }] })` → trùng trả 400.
4. `bcrypt.hash(password, 10)` — băm một chiều có salt, cost 10.
5. `User.create({ ..., settings: { emailEnabled: true } })`.
6. `jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '7d' })` → trả `201 { token, user }` (không bao giờ trả `passwordHash`).

### 6.2 Luồng đăng nhập

1. Tìm user theo `username` **hoặc email**.
2. `bcrypt.compare(password, user.passwordHash)` — so sánh với bản băm.
3. Sai username hoặc sai mật khẩu đều trả **401 "Invalid credentials"** (không tiết lộ tài khoản có tồn tại hay không).
4. Đúng → JWT 7 ngày, cùng format như register.

### 6.3 Middleware `authenticateToken`

- Đọc header `Authorization: Bearer <token>`.
- Thiếu token → **401** "Access token required".
- `jwt.verify` thất bại (hết hạn/sai chữ ký) → **403** "Invalid or expired token".
- Thành công → `req.user = { id, username }` → `next()`.

**Điểm khác biệt 401 vs 403 cần nói đúng**: 401 = chưa có thông tin xác thực; 403 = có token nhưng không hợp lệ/hết hạn.

### 6.4 Bảo vệ ở đâu?

Trong `server.js` — **gắn ở prefix, không phải từng route**:

```js
app.use('/api/v1/auth', authRouter);                 // công khai
app.use('/api/v1/telemetry', authenticateToken, telemetryRouter);
app.use('/api/v1/control', authenticateToken, controlRouter);
app.use('/api/v1/anomalies', authenticateToken, anomaliesRouter);
app.use('/api/v1/chatbot', authenticateToken, chatbotRouter);
app.use('/api/v1/users', authenticateToken, usersRouter);
```

Vì vậy route file không thể "quên" bảo vệ. `/health` giữ công khai cho deployment probe. `GET /api/v1/auth/me` dùng chính middleware này.

### 6.5 Phía React

- `Login.jsx`/`Register.jsx` gọi trực tiếp `fetch('/api/v1/auth/login')` (công khai, không qua `apiFetch`).
- Token lưu `localStorage('safebox_token')`; `apiFetch()` đọc token **tại thời điểm gọi** và gắn `Authorization: Bearer ...` — tránh token cũ sau login/logout.
- `App.jsx` kiểm tra token/user để redirect về login khi chưa xác thực; `/me` dùng để khôi phục phiên.

### 6.6 Câu hỏi thường gặp

**Vì sao không lưu mật khẩu dạng thô?** Vì database bị lộ thì toàn bộ tài khoản lộ theo; bcrypt là hàm băm có salt nên hai tài khoản cùng mật khẩu vẫn ra hai hash khác nhau, và `compare()` chậm cố ý để chống brute-force.

**JWT để ở đâu?** Secret trong biến môi trường `JWT_SECRET` (code có fallback dev). Token chứa `id` + `username`, hết hạn 7 ngày; client giữ ở localStorage trong project này (production nên dùng httpOnly cookie).

**Vì sao `/me` không trả `passwordHash`?** Dùng `.select('-passwordHash')` để loại trường nhạy cảm khỏi mọi phản hồi.

## 7. NC-09 - Cấu hình WiFi cho thiết bị

### 7.1 Luồng cấu hình (`wifi_setup.cpp`)

1. `begin()` cấu hình WiFiManager **non-blocking**: `setConfigPortalBlocking(false)`, `setConnectTimeout(5)`, `setWiFiAutoReconnect(true)`, menu chỉ `wifi` + `info`.
2. `WiFi.mode(WIFI_STA)` rồi `autoConnect("Safebox-AP", "12345678")` — luồng chuẩn: **thử thông tin đã lưu trong NVS trước**; chỉ khi không kết nối được router 2.4 GHz mới mở captive portal.
3. Portal: tên `Safebox-AP`, mật khẩu WPA2 `12345678` (cố định 8 ký tự cho đồ án), trang `192.168.4.1`.
4. Người dùng nhập WiFi → WiFiManager lưu vào **NVS** → ESP32 **chuyển mạng ngay lúc chạy, không cần reboot**; MQTT socket cũ bị đóng và kết nối lại qua mạng mới.
5. `update()` gọi `_manager.process()` mỗi vòng loop — portal được xử lý **không chặn** task an toàn khí (điểm kiến trúc quan trọng).

### 7.2 Hiển thị OLED

`showNetworkStatus()` trong main loop:

| Trạng thái | OLED |
|---|---|
| Đã kết nối router | "WiFi connected" + SSID + IP |
| Portal đang mở | "Safebox-AP" / "PW: 12345678" / "192.168.4.1" |
| Mất mạng | "WiFi offline" / "Waiting..." |

Sự kiện thay đổi kết nối được báo bằng cờ `_connectionChanged` (chỉ khi trạng thái thực sự đổi), main loop bắt cờ và vẽ lại OLED. Màn hình cảnh báo khí luôn chiếm quyền ưu tiên hơn.

### 7.3 Vì sao cần NTP trước khi MQTTS?

TLS trên ESP32 cần thời gian thực để kiểm tra chứng chỉ. `updateNetworkTime()`: khi WiFi kết nối thì gọi `configTime()` với pool.ntp.org; chỉ khi epoch >= 2021-01-01 (hợp lệ) mới cho `mqtt.update()` chạy. NTP chưa xong → log "Waiting for valid NTP time; MQTTS paused".

### 7.4 Vì sao mật khẩu portal cố định?

WiFiManager mặc định portal không mật khẩu hoặc quá phức tạp để vấn đáp. Đồ án cố định `12345678` (8 ký tự, chuẩn WPA2) để vừa bảo vệ portal vừa dễ demo — đây là quyết định cho coursework, không phải chuẩn production.

### 7.5 Giới hạn cần nói thật

- Chỉ hỗ trợ WiFi **2.4 GHz** (ESP32 không hỗ trợ 5 GHz) — nếu router chỉ phát 5 GHz thì không kết nối được.
- Captive redirect hoạt động phụ thuộc hệ điều hành (Android/iOS/Windows); kiểm tra thật đang chờ TC-01.
- Portal dùng SoftAP nên ESP32 tạm thời không truy cập internet khi đang cấu hình (điều này là bình thường của luồng WiFiManager).

## 8. Bản đồ file cần mở khi vấn đáp

| Phần | File chính | Vai trò |
|---|---|---|
| CB-01 sensor | `firmware/src/sensors/dht22_sensor.cpp` | Đọc DHT22, kiểm tra NaN |
| CB-01 đóng gói | `firmware/src/features/telemetry.cpp` | JSON telemetry, gasValid, timestamp |
| CB-01 vòng lặp | `firmware/src/main.cpp` | `readSensorsAndPublish()` mỗi 2s |
| CB-01 backend | `backend/services/telemetryService.js`, `backend/routes/telemetry.js` | Validate payload, lưu, API latest/historical |
| CB-01 frontend | `frontend/src/pages/Overview.jsx` | Card nhiệt độ/độ ẩm, polling 3s |
| NC-02 sensor | `firmware/src/sensors/mq2_sensor.cpp` | ADC 12-bit GPIO 34 |
| NC-02 logic | `firmware/src/features/gas_safety.cpp` | Task FreeRTOS, ngưỡng, 3 mẫu, auto-clear |
| NC-02 đầu ra | `firmware/src/actuators/actuators.cpp` | Buzzer/LED chỉ theo gas alarm, polarity |
| NC-02 hiển thị | `firmware/src/display/oled.cpp` | Cảnh báo khí ưu tiên, mutex 50ms |
| NC-02 MQTT | `firmware/src/network/mqtt_service.cpp` | Publish alert, nhận config ngưỡng |
| NC-02 config | `firmware/src/config.h` | Pin, ngưỡng 800/700, 50ms, 30s warm-up |
| NC-02 backend | `backend/services/anomalyEngine.js` | Nhận EDGE_SAFETY_TRIGGER ghi anomaly_logs |
| NC-07 routes | `backend/routes/auth.js` | register/login/me + authenticateToken |
| NC-07 bảo vệ | `backend/server.js` | Gắn middleware ở 5 prefix |
| NC-07 schema | `backend/models/Schemas.js` | UserSchema, passwordHash, settings |
| NC-07 frontend | `frontend/src/pages/Login.jsx`, `Register.jsx`, `api.js`, `App.jsx` | Form, token localStorage, Bearer header |
| NC-09 | `firmware/src/network/wifi_setup.cpp` | WiFiManager non-blocking, NVS, portal |
| NC-09 OLED | `firmware/src/main.cpp` | `showNetworkStatus()`, NTP gating |

## 9. Bằng chứng hiện có

Chạy tại thư mục `backend`:

```powershell
npm test
```

- **45/45 test pass**, trong đó liên quan phần Hoàng:
  - `authMiddleware.test.js`: mọi prefix bảo vệ trả **401 khi thiếu JWT**.
  - Test hợp đồng MQ2: `gasLevel` phải là số nguyên ADC 0-4095, `gasUnit = adc_index`.
  - Test chặn alert giả: mẫu `gasValid=false` không tạo anomaly phía backend.
  - `telemetryRoutes.test.js`, `userRoutes.test.js` chạy có JWT.
- `npm run test:kiet` (46/46) cũng bao gồm phần xác thực CB-03.

Firmware:

```powershell
cd firmware
pio run
```

- Build qua PlatformIO là bằng chứng code hợp lệ; còn **TC-01, TC-02, TC-03** (portal thật, pipeline thật, đo < 200 ms ngoại tuyến) đang chờ đo trên phần cứng.

Điều chưa được test phần mềm thay thế hoàn toàn:

- Portal captive redirect trên Android/iOS/Windows thật (TC-01).
- ESP32 -> EMQX -> MongoDB pipeline 2 giây thật (TC-02).
- Đo phản hồi gas ngoại tuyến < 200 ms bằng đồng hồ/khung video (TC-03).

## 10. Cheat sheet một phút trước khi vào phòng

```text
CB-01:
DHT22 GPIO 4, đọc 2s, NaN = lỗi -> không publish, không số 0 giả.
Telemetry QoS 0 -> EMQX -> backend validate + SensorReading.create
-> Overview poll /telemetry/latest 3s.
Timestamp chỉ nhận sau mốc 2021 (NTP chưa xong thì bỏ timestamp).

NC-02:
MQ2 GPIO 34, ADC 12-bit 0-4095, unit=adc_index KHÔNG phải PPM.
Task FreeRTOS ưu tiên 4, core 1, mẫu mỗi 50ms (vTaskDelayUntil).
Warm-up 30s: khoá mọi quyết định, gasValid=false, gasLevel=0.
Alarm: 3 mẫu liên tiếp > ngưỡng. Clear: 3 mẫu < clear HOẶC 100 mẫu < alarm (5s).
Ngưỡng mặc định 800/700, backend đổi qua topic /config retained QoS 1.
Buzzer(19, active-low)+LED(18)+OLED chỉ do alarm cục bộ; remote control đã gỡ.
Ghi GPIO trước, OLED sau, cloud cuối; alert retry 3s, mạng lỗi không tắt còi.
3 mẫu x 50ms = ~150ms < 200ms yêu cầu TC-03.

NC-07:
register: normalize email -> chống trùng -> bcrypt hash cost 10 -> JWT 7d.
login: username HOẶC email + bcrypt.compare; sai gì cũng 401.
Middleware: thiếu token 401, token sai/hết hạn 403, req.user = {id, username}.
server.js gắn auth ở 5 prefix (telemetry/control/anomalies/chatbot/users).
Frontend: token localStorage, apiFetch gắn Bearer tại thời điểm gọi.

NC-09:
WiFiManager non-blocking: thử NVS trước, mở Safebox-AP/12345678 khi fail.
Portal 192.168.4.1, lưu NVS, chuyển mạng không cần reboot.
OLED: SSID+IP khi connected; AP info khi portal; offline -> waiting.
NTP hợp lệ (>=2021) mới cho MQTTS chạy.
Task gas ưu tiên 4 không bị portal/TLS chặn.
```

## 11. Câu trả lời mẫu cho các câu hỏi "bẫy"

**Hỏi: "ESP32 gửi telemetry rồi mà bạn nói không có dữ liệu?"**
> Đúng — nếu DHT22 trả NaN (lỗi checksum hoặc mất dây) thì `dhtValid=false` và firmware không publish gói đó. Backend cũng không có cơ chế sinh dữ liệu giả; nếu chưa có gói nào thì `/telemetry/latest` trả 404 và frontend hiển thị trạng thái no-data.

**Hỏi: "Báo động khí mà mất WiFi thì sao?"**
> Vẫn báo. Task GasSafety ưu tiên 4 chạy độc lập, đọc ADC và ghi buzzer/LED trực tiếp. WiFi chỉ ảnh hưởng việc báo lên cloud — gói alert được giữ trong bộ nhớ và thử gửi lại mỗi 3 giây cho tới khi MQTT sẵn sàng.

**Hỏi: "Buzzer và LED có bật từ web được không?"**
> Không — và đó là chủ ý. Nhóm đã gỡ toàn bộ điều khiển từ xa buzzer/LED (web, API, MQTT) để chúng chỉ phục vụ an toàn cục bộ. Chỉ quạt (CB-03 của bạn Kiệt) mới điều khiển từ xa.

**Hỏi: "600 PPM là gì?"**
> Giá trị mà firmware so sánh không phải PPM. Đó là chỉ số ADC thô 12-bit (0-4095) của GPIO 34, được ghi rõ trong payload là `unit: adc_index`. Chúng em cố ý không hiệu chuẩn thành nồng độ khí thực để không đưa ra con số không có căn cứ.

**Hỏi: "JWT hết hạn thì sao?"**
> `jwt.verify` trả lỗi, middleware trả 403, frontend bị redirect về trang login (token cũ trong localStorage không còn tác dụng vì `apiFetch` đọc token tại thời điểm gọi và server từ chối).