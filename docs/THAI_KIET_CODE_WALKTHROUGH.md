# Code walkthrough phần Thái Kiệt

Tài liệu này không sao chép toàn bộ source. Nó trích các đoạn quyết định hành vi của CB-03, NC-01, NC-03 và NC-05, rồi giải thích cách các đoạn nối với nhau. Khi vấn đáp, nên mở file thật và tìm theo tên hàm in đậm.

Nếu còn chưa biết một lời gọi là hàm project hay API React/Browser/Express/Mongoose,
đọc [THAI_KIET_BEGINNER_CODE_GUIDE.md](THAI_KIET_BEGINNER_CODE_GUIDE.md) trước.

Phần 2-7 dùng để hiểu kiến trúc. Khi cần học sát từng statement, đọc tiếp
[mục 8 - Annotated line-by-line](#thai-kiet-line-by-line).

## 1. Cách đọc project

Đọc một luồng theo thứ tự sau:

```text
Input -> route/message handler -> service -> model/output -> test
```

Ví dụ CB-03:

```text
Overview.jsx
  -> POST /api/v1/control/actuator
  -> control.js
  -> mqttService.publishControlCommand()
  -> MQTT topic
  -> MqttService::handleControl()
  -> main.cpp handleControl()
  -> Actuators::setFan()
  -> writeOutput(GPIO 16 theo FAN_RELAY_ACTIVE_LOW)
```

## 2. CB-03 - Điều khiển quạt

### 2.1 Frontend gửi lệnh

File: [`frontend/src/pages/Overview.jsx`](../frontend/src/pages/Overview.jsx)

Web chỉ điều khiển một actuator vật lý là `fan`; buzzer và LED đỏ thuộc edge
safety. Vì vậy code hiện ghi trực tiếp field `fanOn`, không giữ một object mapping
chỉ có một phần tử.

Hàm **handleActuatorToggle** thực hiện ba việc:

```jsx
const targetState = !currentState;
const res = await apiFetch('/api/v1/control/actuator', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    deviceId: telemetry?.deviceId || 'safebox-01',
    actuator,
    state: targetState
  })
});
```

1. Đảo trạng thái hiện tại.
2. Gửi JSON đến backend.
3. Dùng `apiFetch` để tự gắn JWT.

Trước khi gửi, frontend còn chặn actuator vật lý khi `systemArmed=false`. Riêng nút
`systemArmed` luôn dùng được để người dùng có thể re-arm. Backend lặp lại kiểm tra
này; kiểm tra ở frontend chỉ phục vụ UX, còn route backend mới là hàng rào tin cậy.

Sau response thành công, UI cập nhật trước khi vòng polling tiếp theo chạy:

```jsx
setTelemetry((prev) => ({
  ...(prev || {}),
  actuatorStates: {
    ...(prev?.actuatorStates || {}),
    fanOn: targetState
  }
}));
```

Đây là optimistic update. Nó giúp UI phản hồi nhanh nhưng không được xem là xác nhận phần cứng.

### 2.2 JWT helper

File: [`frontend/src/api.js`](../frontend/src/api.js)

```js
export function apiFetch(input, options = {}) {
  const token = localStorage.getItem('safebox_token');
  const headers = new Headers(options.headers || {});

  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, {
    ...options,
    headers
  });
}
```

Điểm cần nói:

- Helper không tự tạo token; token được tạo bởi backend khi login.
- Nó giữ nguyên header caller truyền vào rồi bổ sung Authorization.
- Nếu không có token, backend middleware trả 401.

### 2.3 REST route nhận lệnh

File: [`backend/routes/control.js`](../backend/routes/control.js)

Hàm **parseActuatorState** chuẩn hóa hai dạng input:

```js
function parseActuatorState(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'on') return true;
  if (value === 'off') return false;
  throw new TypeError("state must be a boolean or the string 'on'/'off'");
}
```

Route kiểm tra actuator trước khi publish:

```js
if (actuator !== 'fan') {
  return res.status(400).json({
    success: false,
    error: `Unsupported actuator '${actuator}'`
  });
}

if (!isSystemArmed()) {
  return res.status(403).json({
    success: false,
    error: 'System is DISARMED; remote actuator control is disabled'
  });
}

const targetState = parseActuatorState(state);
const publishResult = await publishControlCommand(deviceId, actuator, targetState);
```

`systemArmed` được xử lý trước allowlist vì đây là backend process state, không phải
actuator MQTT. DISARMED trả 403 cho fan nhưng không chặn local gas safety trên ESP32.
Nếu MQTT thật đang offline, service gắn code `MQTT_OFFLINE` và route trả 503. Input
sai trả 400. Lỗi không dự kiến trả 500.

### 2.4 Kho trạng thái actuator

File: [`backend/services/actuatorStateService.js`](../backend/services/actuatorStateService.js)

Hàm **updateActuatorState** lưu requested state sau publish:

```js
function updateActuatorState(actuator, state) {
  if (actuator !== 'fan') throw new TypeError(`Unsupported actuator '${actuator}'`);

  currentActuatorStates = {
    ...currentActuatorStates,
    fanOn: Boolean(state)
  };
  return getCurrentActuatorStates();
}
```

Hàm **synchronizeActuatorStates** thay snapshot bằng telemetry đã xác thực:

```js
function synchronizeActuatorStates(actuatorStates) {
  currentActuatorStates = {
    fanOn: Boolean(actuatorStates.fanOn),
    buzzerActive: Boolean(actuatorStates.buzzerActive),
    alertLedActive: Boolean(actuatorStates.alertLedActive)
  };
  return getCurrentActuatorStates();
}
```

Service trả object copy, không trả reference map nội bộ. Caller không thể vô tình sửa state mà không đi qua service.

### 2.5 Backend publish MQTT

File: [`backend/services/mqttService.js`](../backend/services/mqttService.js)

Hàm **publishControlCommand**:

```js
const topic = `safebox/${deviceId}/control`;
const payload = JSON.stringify({ actuator, state: state ? 'on' : 'off' });
await new Promise((resolve, reject) => {
  mqttClient.publish(topic, payload, { qos: 1, retain: false }, (error) => {
    if (error) reject(error);
    else resolve();
  });
});
updateActuatorState(actuator, state);
return { status: 'published', topic };
```

Ý nghĩa từng option:

- `qos: 1`: at least once.
- `retain: false`: lệnh cũ không được giữ lại để chạy lại khi thiết bị kết nối sau.
- Chỉ cập nhật requested state sau callback publish không báo lỗi.

Khi telemetry thật quay về:

```js
if (channel === 'telemetry') {
  const result = await ingestTelemetry(payload, deviceId);
  synchronizeActuatorStates(result.reading.actuatorStates);
  return result;
}
```

### 2.6 Firmware nhận MQTT

File: [`firmware/src/network/mqtt_service.cpp`](../firmware/src/network/mqtt_service.cpp)

```cpp
void MqttService::handleControl(byte* payload, unsigned int length) {
  JsonDocument document;
  if (deserializeJson(document, payload, length)) return;

  const char* actuator = document["actuator"] | "";
  bool state = false;
  if (document["state"].is<bool>()) {
    state = document["state"].as<bool>();
  } else {
    state = strcmp(document["state"] | "off", "on") == 0;
  }

  if (_controlHandler) _controlHandler(actuator, state);
}
```

`MqttService` subscribe topic control, parse JSON và đổi state sang boolean. JSON lỗi
bị bỏ qua; network layer chỉ gọi callback, không ghi GPIO trực tiếp.

File: [`firmware/src/main.cpp`](../firmware/src/main.cpp)

```cpp
void handleControl(const char* actuator, bool state) {
  if (strcmp(actuator, "fan") == 0) {
    actuators.setFan(state);
  } else {
    return;
  }
}
```

File: [`firmware/src/actuators/actuators.cpp`](../firmware/src/actuators/actuators.cpp)

```cpp
void Actuators::setFan(bool on) {
  portENTER_CRITICAL(&_mux);
  _fanOn = on;
  applyLocked();
  portEXIT_CRITICAL(&_mux);
}

void Actuators::writeOutput(uint8_t pin, bool on, bool activeLow) {
  digitalWrite(pin, (on != activeLow) ? HIGH : LOW);
}
```

`main.cpp` là allowlist thứ hai: chỉ `fan` được chuyển vào actuator module. Buzzer và
LED đỏ chỉ do `GasSafety` điều khiển local. `Actuators` giữ state dưới spinlock và
map logical state sang polarity; với HL-52S mặc định active-low, GPIO 16 LOW là ON
và HIGH là OFF.

## 3. NC-01 - Z-score và rule engine

File: [`backend/services/anomalyEngine.js`](../backend/services/anomalyEngine.js)

### 3.1 Hằng số và state

```js
const WINDOW_SIZE = 30;
const DEDUPE_WINDOW_MS = Number(process.env.ANOMALY_DEDUPE_WINDOW_MS || 60_000);
const MIN_DELTA = { temperature: 1.0, humidity: 2.0 };
```

`DEFAULT_THRESHOLDS` được freeze để tránh sửa nhầm object mặc định. Runtime dùng một bản copy, nên `updateThresholds()` vẫn thay đổi được cấu hình đang chạy.

```js
let systemThresholds = { ...DEFAULT_THRESHOLDS };
const rollingBuffers = new Map();
const anomalyDedupMap = new Map();
```

Key rolling buffer là `deviceId:sensorType`, vì mỗi thiết bị và mỗi metric cần baseline riêng.

### 3.2 Tính mean và standard deviation

```js
function meanAndStdDev(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce(
    (sum, value) => sum + ((value - mean) ** 2),
    0
  ) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}
```

Code dùng population variance, chia cho N. Window 30 mẫu được coi là toàn bộ baseline hiện tại, không phải mẫu dùng để suy rộng thống kê học thuật.

### 3.3 Evaluate mẫu mới

```js
if (!Object.hasOwn(MIN_DELTA, sensorType)) {
  return { ready: false, zScore: null, isAnomaly: false };
}
```

Dòng này là hàng rào bảo đảm gas và motion không bị đưa vào Z-score.

```js
if (buffer.length < WINDOW_SIZE) {
  buffer.push(value);
  return { ready: false, zScore: null, mean: null, stdDev: null, isAnomaly: false };
}

const { mean, stdDev } = meanAndStdDev(buffer);
const zScore = stdDev === 0 ? 0 : (value - mean) / stdDev;
const isAnomaly = stdDev !== 0
  && Math.abs(zScore) > systemThresholds.zScoreLimit
  && Math.abs(value - mean) > MIN_DELTA[sensorType];

buffer.shift();
buffer.push(value);
return { ready: true, zScore, mean, stdDev, isAnomaly };
```

Cold start trả về ngay sau khi thêm mẫu. Khi baseline đã đủ, thứ tự rất quan trọng:
evaluate bằng 30 mẫu cũ, bỏ mẫu cũ nhất, rồi mới thêm mẫu vừa chấm vào window.

### 3.4 Bốn rule builder

Sau refactor, mỗi sensor có một hàm dễ mở và giải thích:

```text
buildGasCandidate()
buildTemperatureCandidate()
buildMotionCandidate()
buildHumidityCandidate()
```

Hàm chính chỉ còn orchestration:

```js
const context = { deviceId, timestamp, metrics };
const temperatureStats = evaluateZScore(deviceId, 'temperature', metrics.temperature);
const humidityStats = evaluateZScore(deviceId, 'humidity', metrics.humidity);
if (!systemArmedState) return [];
const candidates = [
  buildGasCandidate(context),
  buildTemperatureCandidate(context, temperatureStats),
  buildMotionCandidate(context),
  buildHumidityCandidate(context, humidityStats)
].filter(Boolean);

const created = await Promise.all(candidates.map(createAnomalyIfNew));
return created.filter(Boolean);
```

Hai lời gọi Z-score đứng trước nhánh DISARMED nên baseline vẫn lăn. Nhờ vậy re-arm
không so mẫu mới với một window cũ. `candidate` là object trung gian; sau dedupe,
code tạo MongoDB document trước rồi mới chạy fan/email best-effort.

### 3.5 Temperature rule

```js
const aboveMaximum = metrics.temperature > systemThresholds.tempMax;
const belowMinimum = metrics.temperature < systemThresholds.tempMin;
```

Hard bounds được ưu tiên. Nếu trong bounds và automatic mode bật, code mới xét Z-score.

```js
autoFan: metrics.temperature > statistics.mean
```

Z-score có thể âm hoặc dương. Fan chỉ bật khi bất thường theo hướng nóng lên, không bật khi nhiệt độ giảm mạnh.

### 3.6 Dedupe và action

```js
function dedupeKey(candidate) {
  return `${candidate.deviceId}:${candidate.sensorType}:${candidate.triggerType}`;
}
```

```js
const lastCreatedAt = anomalyDedupMap.get(key);
if (lastCreatedAt !== undefined && now - lastCreatedAt < DEDUPE_WINDOW_MS) {
  return null;
}
```

Key được reserve trước các thao tác async để hai message đến gần nhau không cùng vượt qua kiểm tra.

`createAnomalyIfNew()` reserve key trước `await`, tạo `AnomalyLog` với `LOGGED`, rồi
mới chạy action. Mỗi action có `try/catch`; nếu fan/email lỗi, anomaly đã tồn tại và
`actionsTaken` được update bằng lý do lỗi. Đây là graceful degradation.

## 4. NC-03 - Time Series ingestion

### 4.1 Schema

File: [`backend/models/Schemas.js`](../backend/models/Schemas.js)

```js
const SensorReadingSchema = new Schema({
  timestamp: { type: Date, required: true, default: Date.now },
  deviceId: { type: String, required: true, index: true },
  metrics: {
    temperature: { type: Number, required: true },
    humidity: { type: Number, required: true },
    gasLevel: { type: Number, required: true },
    gasRaw: { type: Number, default: null },
    gasAlarmThreshold: { type: Number, default: null },
    gasValid: { type: Boolean, default: true },
    gasUnit: { type: String, enum: ['adc_index'], default: 'adc_index' },
    motionDetected: { type: Boolean, required: true }
  },
  actuatorStates: {
    fanOn: { type: Boolean, required: true, default: false },
    buzzerActive: { type: Boolean, required: true, default: false },
    alertLedActive: { type: Boolean, required: true, default: false },
    gasAlarmActive: { type: Boolean, default: false }
  }
}, {
  autoCreate: false,
  autoIndex: false
});
```

`autoCreate=false` ngăn Mongoose tạo collection thường trước khi service có cơ hội tạo Time Series collection.

### 4.2 Tạo và verify collection

File: [`backend/services/timeSeriesService.js`](../backend/services/timeSeriesService.js)

```js
const EXPIRE_AFTER_SECONDS = 30 * 24 * 60 * 60;
const TIME_SERIES_OPTIONS = {
  timeField: 'timestamp',
  metaField: 'deviceId',
  granularity: 'seconds'
};
```

Hàm **ensureSensorReadingsTimeSeries**:

1. Gọi `listCollections()` tìm `sensor_readings`.
2. Nếu chưa có, gọi `createCollection()` với `timeseries` và TTL.
3. Đọc metadata lại.
4. `validateCollectionOptions()` so từng option.
5. Sai cấu hình thì throw để startup fail rõ ràng.

### 4.3 Validate và ingest

File: [`backend/services/telemetryService.js`](../backend/services/telemetryService.js)

```js
async function ingestTelemetry(payload, expectedDeviceId) {
  const normalized = validateTelemetryPayload(payload, expectedDeviceId);
  const reading = await SensorReading.create(normalized);
  const anomalies = await processTelemetryForAnomalies(reading);
  return { reading, anomalies };
}
```

`expectedDeviceId` lấy từ MQTT topic. Nếu payload khai một deviceId khác topic, validation từ chối để tránh ghi dữ liệu sai thiết bị.

Validation còn kiểm tra:

- Nhiệt độ -40 đến 85°C.
- Độ ẩm 0 đến 100%.
- Gas là integer ADC `0..4095`, `gasUnit=adc_index`; nếu có `gasRaw` thì phải bằng `gasLevel`.
- `gasAlarmThreshold` là integer tùy chọn trong giới hạn contract.
- Motion và actuator states là boolean.
- Timestamp phải parse được.

### 4.4 Historical route

File: [`backend/routes/telemetry.js`](../backend/routes/telemetry.js)

```js
let databaseQuery = SensorReading.find(query)
  .sort({ timestamp: -1 })
  .limit(parsedLimit);

const readings = await databaseQuery;
readings.reverse();
```

Hai bước này trả N mẫu mới nhất nhưng vẫn theo thứ tự thời gian phù hợp để vẽ chart.

## 5. NC-05 - Nodemailer và throttle

File: [`backend/services/emailService.js`](../backend/services/emailService.js)

### 5.1 Hằng số

```js
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const emailThrottleMap = new Map();
```

### 5.2 Validate config

`getEmailConfig()` chỉ cho bật email khi đủ SMTP host, user và password. Port phải là integer từ 1 đến 65535. `SMTP_SECURE` mặc định true nếu port 465. `ALERT_RECIPIENT_EMAIL` không còn là recipient chính; nó chỉ fallback khi database chưa có user.

### 5.3 Lấy recipient từ user profile

File: [`backend/services/userNotificationService.js`](../backend/services/userNotificationService.js)

```js
const users = await User.find({})
  .select('email settings.emailEnabled')
  .lean();

const recipients = users
  .filter((user) => user.settings?.emailEnabled !== false)
  .map((user) => normalizeEmail(user.email));
```

Email nhận cảnh báo chính là `User.email` đã nhập khi đăng ký. Settings lưu `settings.emailEnabled`. Khi đã có user nhưng tất cả đều tắt, resolver trả danh sách rỗng và không dùng fallback, nhờ đó lựa chọn trên web có hiệu lực thật.

### 5.4 Gửi email

```js
const severity = String(alert.severity || '').toUpperCase();
if (!shouldSendAlertEmail(severity)) {
  return { status: 'ignored', reason: 'severity' };
}
```

MEDIUM và LOW dừng trước khi chạm SMTP.

```js
const throttleKey = `${alert.deviceId}:${alert.sensorType}`;
const now = nowProvider();
const lastSent = emailThrottleMap.get(throttleKey);
if (lastSent !== undefined && now - lastSent < THROTTLE_WINDOW_MS) {
  return { status: 'throttled', lastSentAt: new Date(lastSent) };
}
```

Sau đó mới build message và gửi:

```js
const providedRecipients = await recipientProvider(config);
const recipients = normalizeRecipients(providedRecipients);
if (recipients.length === 0) {
  return { status: 'skipped', reason: 'no_recipients' };
}

const recipientHeaders = buildRecipientHeaders(recipients, config.user);
const result = await activeTransporter.sendMail({
  from: config.from,
  ...recipientHeaders,
  ...message
});

emailThrottleMap.set(throttleKey, now);
```

Map chỉ được cập nhật sau khi `sendMail` resolve thành công.

Một recipient dùng header `to`; nhiều recipient dùng `bcc` để họ không nhìn thấy địa chỉ của nhau. Map throttle chỉ được cập nhật sau khi `sendMail` resolve thành công.

### 5.5 HTML safety

Mọi giá trị động được đưa qua `escapeHtml()` trước khi chèn vào HTML. Điều này ngăn dữ liệu cảm biến hoặc device ID chứa HTML tùy ý làm hỏng email.

Timestamp vẫn được lưu và xử lý nội bộ theo UTC. Riêng template email gọi `formatVietnamTimestamp()` với timezone `Asia/Ho_Chi_Minh`, nên người nhận thấy định dạng `YYYY-MM-DD HH:mm:ss UTC+7` mà không làm thay đổi dữ liệu gốc.

## 6. Test map

| File test | Chứng minh |
|---|---|
| `actuatorStateService.test.js` | Kiểm tra trực tiếp fan và telemetry reconciliation |
| `anomalyEngine.test.js` | N=30, per-device, zero variance, min delta, hard rules, dedupe, integrated action |
| `emailService.test.js` | Severity filter, 15 phút, profile recipients, opt-out, HTML escaping |
| `userNotificationService.test.js` | Chuẩn hóa, loại trùng và lọc user đã tắt email |
| `userRoutes.test.js` | Settings lưu `settings.emailEnabled` đúng field |
| `telemetryService.test.js` | Payload validation, topic/device match, edge alert, actuator confirmation |
| `telemetryRoutes.test.js` | Latest-N, `maxPoints`, projection và chronological response |
| `timeSeriesService.test.js` | Collection options và fail-fast |
| `scripts/testCb03Mock.js` | REST fan ON/status/OFF có JWT trong simulation mode |

## 6.1 Hợp đồng MQ2 cần biết khi giải thích telemetry

Firmware đọc trực tiếp `analogRead(GPIO34)` và gửi cùng giá trị tương đối dưới
hai trường `metrics.gasLevel` và `metrics.gasRaw`. Đơn vị được khai báo rõ là
`adc_index`; hệ thống không gọi giá trị chưa hiệu chuẩn này là PPM.

`telemetryService.js` yêu cầu chỉ số nguyên `0..4095`, kiểm tra
`gasUnit=adc_index`, hai alias phải bằng nhau và giữ `gasValid`. Cờ này thể hiện
producer có cho phép dùng mẫu hay không, không phải chẩn đoán điện. Anomaly engine
bỏ qua `gasValid=false`; mẫu hợp lệ vượt ngưỡng runtime tạo cảnh báo luật cứng.

Đường an toàn cục bộ nằm trong FreeRTOS task priority 4: mỗi 100 ms đọc MQ2 rồi
trực tiếp cập nhật còi, LED đỏ và OLED qua lock, độc lập với loop WiFi/MQTT. TC-03
vẫn phải đo trên phần cứng cả offline và khi network đang bận; build thành công
không tự chứng minh thời gian phản hồi.

## 7. Điều nên và không nên học thuộc

Nên nhớ:

- Tên bốn luồng và thứ tự các tầng.
- Công thức Z-score, N=30, threshold 3.0 và minimum delta.
- Topic control và telemetry.
- QoS 1 là at least once.
- Time Series options và TTL 30 ngày.
- Email key và window 15 phút.

Không cần học thuộc:

- Toàn bộ HTML email template.
- Tất cả Tailwind class.
- Từng dòng setup MQTT/TLS.
- Giá trị ngẫu nhiên trong mock telemetry.

Khi không nhớ một chi tiết, mở đúng file và giải thích theo luồng dữ liệu. Khả năng định vị code và lý giải quyết định quan trọng hơn việc đọc thuộc source.

<a id="thai-kiet-line-by-line"></a>

## 8. Annotated line-by-line cho riêng phần Thái Kiệt

Phần này chỉ đi qua statement quyết định hành vi của `CB-03`, `NC-01`, `NC-03`,
`NC-05` và các điểm nối trực tiếp. Nó cố ý bỏ qua import/export, JSX trình bày,
Tailwind, auth, chatbot, WiFiManager và local gas-safety task vì đó không phải code
cốt lõi trong phạm vi report của Kiệt.

Comment tiếng Việt dưới đây dùng để học. Source thật dùng comment English với cùng
ý nghĩa để giữ style chung của repository.

### 8.1 CB-03 - Từng dòng từ click đến GPIO 16

#### A. Frontend tạo command

File: `frontend/src/pages/Overview.jsx`, hàm `handleActuatorToggle`.

```jsx
setPendingActuator(actuator); // Ghi actuator đang xử lý để disable nút, tránh double-click.
setControlFeedback(null);    // Xóa thông báo của lần gửi trước.

if (actuator !== 'systemArmed' && !systemArmed) { // Chỉ actuator vật lý bị chặn.
  setControlFeedback({                           // Báo lỗi ngay trên UI.
    type: 'error',
    message: 'System is DISARMED; remote actuator control is disabled'
  });
  setPendingActuator(null); // Mở khóa nút vì request chưa hề được gửi.
  return;                   // Kết thúc hàm, không thể đi tiếp tới API.
}

const targetState = !currentState; // Tính trạng thái đích; payload không phải lệnh toggle.
const res = await apiFetch('/api/v1/control/actuator', { // Chờ REST response.
  method: 'POST',                                      // Route thay đổi runtime state.
  headers: { 'Content-Type': 'application/json' },     // Body được encode JSON.
  body: JSON.stringify({
    deviceId: telemetry?.deviceId || 'safebox-01', // Ưu tiên ID ESP32 đang báo telemetry.
    actuator,                                      // 'fan' hoặc 'systemArmed'.
    state: targetState                             // Boolean contract ở REST boundary.
  })
});

const json = await res.json(); // Parse payload phản hồi của backend.
if (!res.ok || !json.success) { // HTTP và business flag đều phải thành công.
  throw new Error(json.error || 'Control command failed');
}

if (actuator === 'systemArmed') {
  setSystemArmed(targetState); // Armed state không nằm trong telemetry của ESP32.
} else {
  setTelemetry((prev) => ({
    ...(prev || {}),                    // Giữ timestamp, deviceId và metrics cũ.
    actuatorStates: {
      ...(prev?.actuatorStates || {}),  // Giữ buzzer/LED do ESP32 báo cáo.
      fanOn: targetState                // Chỉ optimistic-update fanOn.
    }
  }));
}
```

Ba dòng cuối của `try/catch/finally` cần đọc như sau:

```jsx
setControlFeedback({ type: 'success', message: successMessage }); // Phản hồi UX, chưa phải ACK vật lý.
setControlFeedback({ type: 'error', message: err.message });       // Lỗi không sửa telemetry cũ.
setPendingActuator(null);                                          // finally luôn mở lại nút.
```

#### B. JWT helper

File: `frontend/src/api.js`.

```js
const token = localStorage.getItem('safebox_token'); // Đọc lúc gọi để không dùng token cũ.
const headers = new Headers(options.headers || {});  // Clone header caller đã truyền.
if (token) headers.set('Authorization', `Bearer ${token}`); // Gắn JWT nếu đã login.
return fetch(input, { ...options, headers });        // Giữ method/body, thay bằng header đã auth.
```

#### C. Backend route phân loại System Armed và fan

File: `backend/routes/control.js`, `POST /actuator`.

```js
const {
  deviceId = process.env.DEVICE_ID || 'safebox-01', // Fallback khi caller không gửi ID.
  actuator,
  state
} = req.body;

if (!actuator || state === undefined) { // Không dùng !state vì false là lệnh OFF hợp lệ.
  return res.status(400).json({ success: false, error: '...' });
}

if (actuator === 'systemArmed') {       // Đây là process state, không phải MQTT actuator.
  const targetState = parseActuatorState(state); // Chuẩn hóa boolean hoặc on/off.
  setSystemArmed(targetState);          // Đổi policy anomaly/control trong backend.
  return res.json({                     // Return ngay nên không publish MQTT.
    success: true,
    systemArmed: isSystemArmed()
  });
}

if (actuator !== 'fan') {               // Contract chỉ cho một actuator vật lý.
  return res.status(400).json({ success: false, error: '...' });
}

if (!isSystemArmed()) {                 // Backend lặp guard để chống bypass frontend.
  return res.status(403).json({ success: false, error: '...' });
}

const targetState = parseActuatorState(state); // MQTT service chỉ nhận boolean.
const publishResult = await publishControlCommand( // Chờ broker callback hoặc throw.
  deviceId,
  actuator,
  targetState
);
```

Ánh xạ lỗi ở cuối route:

```js
const status = err.code === 'MQTT_OFFLINE' // Broker offline là dependency unavailable.
  ? 503
  : err instanceof TypeError              // Input/contract sai là client error.
    ? 400
    : 500;                                // Lỗi bất ngờ mới là server error.
```

#### D. MQTT publish và optimistic backend state

File: `backend/services/mqttService.js`, `publishControlCommand`.

```js
if (!DEVICE_ID_PATTERN.test(deviceId)) throw new TypeError('Invalid deviceId'); // Chặn topic injection.
if (actuator !== 'fan') throw new TypeError('Unsupported actuator');             // Chỉ fan.
if (typeof state !== 'boolean') throw new TypeError('Actuator state must be a boolean');

if (isMockHardware()) {                 // Nhánh test không cần broker/ESP32.
  updateActuatorState(actuator, state); // Mô phỏng requested state.
  return { status: 'mocked', topic: null };
}

if (!mqttClient || !mqttClient.connected) { // Không được trả success giả khi broker mất.
  const error = new Error('MQTT broker is not connected');
  error.code = 'MQTT_OFFLINE';               // Route dùng code này để trả 503.
  throw error;
}

const topic = `safebox/${deviceId}/control`; // Device identity nằm trong topic.
const payload = JSON.stringify({
  actuator,
  state: state ? 'on' : 'off'               // Boolean REST -> chuỗi MQTT dễ đọc.
});

await new Promise((resolve, reject) => {     // Chuyển callback MQTT.js thành Promise.
  mqttClient.publish(
    topic,
    payload,
    { qos: 1, retain: false },               // At-least-once, không replay lệnh cũ.
    (error) => error ? reject(error) : resolve()
  );
});

updateActuatorState(actuator, state);        // Chỉ optimistic sau publish callback.
return { status: 'published', topic };       // Không khẳng định relay đã đổi.
```

File: `backend/services/actuatorStateService.js`.

```js
if (actuator !== 'fan') throw new TypeError('Unsupported actuator');
currentActuatorStates = {
  ...currentActuatorStates,                 // Giữ state thiết bị khác.
  fanOn: Boolean(state)                     // Requested state vừa publish.
};

currentActuatorStates = {                   // Telemetry về thì replace toàn bộ snapshot.
  fanOn: Boolean(actuatorStates.fanOn),
  buzzerActive: Boolean(actuatorStates.buzzerActive),
  alertLedActive: Boolean(actuatorStates.alertLedActive)
};
```

Không merge ở `synchronizeActuatorStates()`: nếu firmware bỏ một field thì state cũ
không được âm thầm tồn tại như thể thiết bị vẫn xác nhận nó.

#### E. Firmware parse, allowlist và ghi relay

File: `firmware/src/network/mqtt_service.cpp`.

```cpp
JsonDocument document;                              // Bộ chứa JSON control.
if (deserializeJson(document, payload, length)) {  // Parse đúng length MQTT buffer.
    SAFEBOX_LOG_LN("[MQTT] Ignored invalid control JSON");
    return;                                         // JSON lỗi không tới GPIO.
}

const char* actuator = document["actuator"] | ""; // Thiếu field -> chuỗi rỗng.
bool state = false;                                 // Fail-safe mặc định OFF.
if (document["state"].is<bool>()) {
    state = document["state"].as<bool>();           // Hỗ trợ publisher gửi boolean.
} else {
    state = strcmp(document["state"] | "off", "on") == 0; // Contract thường là on/off.
}
if (_controlHandler) _controlHandler(actuator, state); // Delegate, network layer không ghi pin.
```

File: `firmware/src/main.cpp`.

```cpp
if (strcmp(actuator, "fan") == 0) { // Zero nghĩa là đúng chuỗi fan.
    actuators.setFan(state);         // Chuyển desired state sang hardware abstraction.
} else {
    SAFEBOX_LOGF("[Control] Unknown actuator: %s\n", actuator); // Buzzer/LED cũng bị từ chối.
    return;
}
```

File: `firmware/src/actuators/actuators.cpp`.

```cpp
portENTER_CRITICAL(&_mux); // Khóa vì GasSafety task cũng dùng actuator snapshot.
_fanOn = on;               // Lưu logical state, chưa quan tâm active-low.
applyLocked();             // Ghi toàn bộ output nhất quán trong lúc giữ lock.
portEXIT_CRITICAL(&_mux);  // Cho task khác truy cập lại.

digitalWrite(pin, (on != activeLow) ? HIGH : LOW);
// active-low: ON -> LOW, OFF -> HIGH; active-high thì ngược lại.
```

### 8.2 NC-01 - Từng dòng Z-score, rule, dedupe và action

#### A. State và key của rolling window

File: `backend/services/anomalyEngine.js`.

```js
const WINDOW_SIZE = 30; // Cần đúng 30 mẫu trước làm baseline.
const MIN_DELTA = {
  temperature: 1.0,    // Spike nhiệt phải lệch mean hơn 1°C.
  humidity: 2.0        // Spike ẩm phải lệch mean hơn 2%.
};

const rollingBuffers = new Map(); // State Z-score nằm trong RAM.
const anomalyDedupMap = new Map(); // State chống log lặp cũng nằm trong RAM.

function bufferKey(deviceId, sensorType) {
  return `${deviceId}:${sensorType}`; // Không trộn device hoặc metric.
}

function getRollingBuffer(deviceId, sensorType) {
  const key = bufferKey(deviceId, sensorType);
  if (!rollingBuffers.has(key)) rollingBuffers.set(key, []); // Lazy-create series.
  return rollingBuffers.get(key);                            // Trả đúng array đang lăn.
}
```

#### B. Mean và population standard deviation

```js
const mean = values.reduce(
  (sum, value) => sum + value, // Cộng từng mẫu baseline.
  0                            // Tổng ban đầu.
) / values.length;             // Chia N để lấy mean.

const variance = values.reduce(
  (sum, value) => sum + ((value - mean) ** 2), // Bình phương khoảng cách tới mean.
  0
) / values.length;                                // Population variance chia N.

return {
  mean,
  stdDev: Math.sqrt(variance) // Standard deviation là căn bậc hai variance.
};
```

#### C. `evaluateZScore()` từng nhánh

```js
if (!Object.hasOwn(MIN_DELTA, sensorType)) { // MIN_DELTA đồng thời là allowlist.
  return { ready: false, zScore: null, isAnomaly: false }; // Gas/motion dừng ở đây.
}

if (!Number.isFinite(value)) {              // NaN/Infinity không được vào baseline.
  throw new TypeError(`${sensorType} must be a finite number`);
}

const buffer = getRollingBuffer(deviceId, sensorType); // Baseline đúng device + sensor.
if (buffer.length < WINDOW_SIZE) {           // Cold start: chưa đủ 30 mẫu trước.
  buffer.push(value);                        // Chỉ dùng mẫu hiện tại để lấp baseline.
  return { ready: false, zScore: null, mean: null, stdDev: null, isAnomaly: false };
}

const { mean, stdDev } = meanAndStdDev(buffer); // Chấm trên đúng 30 mẫu cũ.
const zScore = stdDev === 0 ? 0 : (value - mean) / stdDev; // Tránh chia 0.
const isAnomaly = stdDev !== 0
  && Math.abs(zScore) > systemThresholds.zScoreLimit
  && Math.abs(value - mean) > MIN_DELTA[sensorType];

buffer.shift();                     // Bỏ mẫu cũ nhất sau khi đã chấm.
buffer.push(value);                 // Thêm mẫu hiện tại cho lần kế tiếp.
return { ready: true, zScore, mean, stdDev, isAnomaly };
```

Điểm vấn đáp quan trọng nhất là thứ tự `calculate -> shift -> push`. Nếu `push`
trước, chính spike làm mean/variance tăng và kéo Z-score của nó xuống.

#### D. Rule builder cho từng sensor

Gas:

```js
if (metrics.gasValid === false) return null;        // Warm-up/invalid không alert.
if (!Number.isFinite(metrics.gasLevel)) return null; // Guard cho direct caller.
if (metrics.gasLevel <= systemThresholds.gasMax) return null; // Chưa vượt ngưỡng.
return hardThresholdCandidate(
  deviceId,
  timestamp,
  'gasLevel',
  metrics.gasLevel,
  systemThresholds.gasMax,
  'CRITICAL'                                      // Gas hard breach luôn CRITICAL.
);
```

Temperature:

```js
const aboveMaximum = metrics.temperature > systemThresholds.tempMax;
const belowMinimum = metrics.temperature < systemThresholds.tempMin;

if (aboveMaximum || belowMinimum) { // Hard bound được xét trước automatic Z-score.
  return {
    ...hardThresholdCandidate(/* temperature, HIGH */),
    autoFan: aboveMaximum           // Chỉ nóng quá max mới bật fan.
  };
}

if (!systemThresholds.isAutomatic || !statistics.isAnomaly) return null;
// isAutomatic=false chỉ tắt Z-score, không tắt hard bound phía trên.

return {
  triggerType: 'Z_SCORE_EXCEEDED',
  calculatedZScore: Number(statistics.zScore.toFixed(3)), // Làm tròn để audit dễ đọc.
  severity: 'HIGH',
  autoFan: metrics.temperature > statistics.mean // Cold spike không bật fan.
};
```

Motion và humidity:

```js
if (!metrics.motionDetected || !systemArmedState) return null;
// Motion là boolean: chỉ hard rule, chỉ meaningful khi armed.

const aboveMaximum = metrics.humidity > systemThresholds.humidityMax;
const belowMinimum = metrics.humidity < systemThresholds.humidityMin;
// Humidity hard/Z-score có severity MEDIUM nên được log nhưng không email.
```

#### E. Action fan/email

```js
const actionsTaken = ['LOGGED']; // Bản ghi anomaly luôn bắt đầu bằng trạng thái đã log.

if (candidate.autoFan) {
  try {
    const result = await controlPublisher( // Dependency injection tới CB-03.
      candidate.deviceId,
      'fan',
      true
    );
    actionsTaken.push(
      result.status === 'mocked'
        ? 'FAN_ON_SIMULATED'
        : 'FAN_ON_COMMAND_PUBLISHED'
    );
  } catch (error) {
    actionsTaken.push(`FAN_ON_COMMAND_FAILED: ${error.message}`); // Không throw tiếp.
  }
}

if (candidate.severity === 'HIGH' || candidate.severity === 'CRITICAL') {
  try {
    const emailResult = await sendAlertEmail(candidate); // NC-05 tự throttle/resolve user.
    actionsTaken.push(`EMAIL_${emailResult.status.toUpperCase()}`);
  } catch (error) {
    actionsTaken.push(`EMAIL_FAILED: ${error.message}`); // Anomaly vẫn còn trong DB.
  }
}

return actionsTaken; // Caller update audit array vào AnomalyLog.
```

#### F. Dedupe, persist trước action, rollback reservation

```js
const key = `${candidate.deviceId}:${candidate.sensorType}:${candidate.triggerType}`;
const now = Date.now();
const lastCreatedAt = anomalyDedupMap.get(key);

if (lastCreatedAt !== undefined && now - lastCreatedAt < DEDUPE_WINDOW_MS) {
  return null; // Event tương đương trong 60 giây là duplicate hợp lệ.
}

anomalyDedupMap.set(key, now); // Reserve trước await để đóng race concurrent message.

try {
  const anomaly = await AnomalyLog.create({ // Persist audit fact trước side effects.
    deviceId: candidate.deviceId,
    timestamp: candidate.timestamp || new Date(),
    sensorType: candidate.sensorType,
    triggerType: candidate.triggerType,
    observedValue: candidate.observedValue,
    calculatedZScore: candidate.calculatedZScore ?? null,
    thresholdLimit: candidate.thresholdLimit,
    severity: candidate.severity,
    actionsTaken: ['LOGGED'],
    resolved: false
  });

  const actionsTaken = await executeActions(candidate); // Fan/email chạy sau create.
  if (actionsTaken.length > 1) {
    await AnomalyLog.findByIdAndUpdate(anomaly._id, { actionsTaken }); // Bổ sung audit outcome.
  }
  return anomaly;
} catch (error) {
  if (anomalyDedupMap.get(key) === now) anomalyDedupMap.delete(key); // Cho phép retry.
  throw error;                                                       // Caller vẫn biết lỗi.
}
```

#### G. Orchestrator và System Armed

```js
const context = { deviceId, timestamp, metrics }; // Input chung cho bốn builder.

const temperatureStats = evaluateZScore( // Chấm và roll baseline temperature.
  deviceId,
  'temperature',
  metrics.temperature
);
const humidityStats = evaluateZScore(    // Chấm và roll baseline humidity.
  deviceId,
  'humidity',
  metrics.humidity
);

if (!systemArmedState) return []; // Return sau hai lời gọi nên baseline vẫn cập nhật.

const candidates = [
  buildGasCandidate(context),
  buildTemperatureCandidate(context, temperatureStats),
  buildMotionCandidate(context),
  buildHumidityCandidate(context, humidityStats)
].filter(Boolean); // Loại các null = sensor không vi phạm rule.

const created = await Promise.all(
  candidates.map(createAnomalyIfNew) // Candidate độc lập có thể xử lý song song.
);
return created.filter(Boolean);      // Loại null do dedupe.
```

`processEdgeAlert()` không đi qua nhánh DISARMED này vì alert đã được ESP32 quyết
định local. Đây là lý do System Armed không thể vô hiệu hóa edge gas safety.

### 8.3 NC-03 - Từng dòng MongoDB Time Series và ingestion

#### A. Ba lớp không được nhầm

```text
Schemas.js             -> document được phép có field nào
timeSeriesService.js   -> collection phải có timeField/metaField/TTL nào
telemetryService.js    -> MQTT payload được tin và ghi theo thứ tự nào
```

Schema đặt:

```js
autoCreate: false, // Cấm Mongoose tự tạo collection thường.
autoIndex: false   // Time Series không dựa vào auto-index của schema.
```

Các field chính:

```js
timestamp                 // timeField của MongoDB Time Series.
deviceId                  // metaField để nhóm series theo thiết bị.
metrics.temperature       // Continuous, dùng hard rule + Z-score.
metrics.humidity          // Continuous, dùng hard rule + Z-score.
metrics.gasLevel          // Alias raw ADC 0..4095 cho compatibility.
metrics.gasRaw            // Raw ADC rõ nghĩa; nếu có phải bằng gasLevel.
metrics.gasAlarmThreshold // Ngưỡng edge ESP32 đang dùng, có thể vắng ở document cũ.
metrics.gasValid          // Producer cho phép/không cho phép dùng mẫu gas.
metrics.gasUnit           // Chỉ nhận adc_index, không tuyên bố PPM.
metrics.motionDetected    // Boolean hard rule.
actuatorStates            // Snapshot trạng thái thiết bị tại cùng thời điểm.
```

#### B. Tạo và xác minh Time Series collection

File: `backend/services/timeSeriesService.js`.

```js
const COLLECTION_NAME = 'sensor_readings';
const EXPIRE_AFTER_SECONDS = 30 * 24 * 60 * 60; // 2,592,000 giây = 30 ngày.
const TIME_SERIES_OPTIONS = {
  timeField: 'timestamp', // MongoDB bucket dữ liệu theo thời gian này.
  metaField: 'deviceId',  // Metadata ổn định phân biệt thiết bị.
  granularity: 'seconds'  // Telemetry gửi khoảng mỗi 2 giây.
};
```

Hàm startup:

```js
function findCollectionInfo(db) {
  return db.listCollections({ name: COLLECTION_NAME }, { nameOnly: false }).next();
}

let collectionInfo = await findCollectionInfo(db); // Lấy cả options, không chỉ tên.

if (!collectionInfo) {
  try {
    await db.createCollection(COLLECTION_NAME, {
      timeseries: TIME_SERIES_OPTIONS,          // Options chỉ đặt được ở collection level.
      expireAfterSeconds: EXPIRE_AFTER_SECONDS  // Retention tự động.
    });
  } catch (error) {
    if (error.codeName !== 'NamespaceExists' && error.code !== 48) {
      throw error; // Chỉ bỏ qua race khi instance khác vừa tạo cùng collection.
    }
  }

  collectionInfo = await findCollectionInfo(db); // Đọc lại metadata thật sau create/race.
}

if (!collectionInfo) throw new Error('MongoDB did not return metadata');
validateCollectionOptions(collectionInfo); // Sai time/meta/granularity/TTL -> fail startup.
```

`validateCollectionOptions()` lặp qua từng option mong đợi, gom mọi mismatch vào
một error. Cách này cho người deploy biết phải migration gì thay vì backend âm thầm
ghi vào collection sai loại.

#### C. Validate MQTT payload trước mọi side effect

File: `backend/services/telemetryService.js`.

```js
requireObject(payload, 'telemetry payload'); // Reject null, array và primitive.
const deviceId = payload.deviceId || expectedDeviceId; // Legacy có thể thiếu ID trong body.

if (!deviceId || !DEVICE_ID_PATTERN.test(deviceId)) {
  throw new TypeError('deviceId ...'); // Chặn ID làm hỏng topic/query contract.
}

if (expectedDeviceId && deviceId !== expectedDeviceId) {
  throw new TypeError('payload deviceId does not match MQTT topic device');
  // Topic safebox/A không được ghi document nhận là device B.
}

const metrics = requireObject(payload.metrics, 'metrics');
const actuatorStates = requireObject(payload.actuatorStates, 'actuatorStates');
// Mỗi message phải là một snapshot hoàn chỉnh, không phải patch rời rạc.
```

Hai helper trong cùng file giữ phần chính ngắn và tách đúng hai nhóm dữ liệu:

```js
function normalizeMetrics(metrics) {
  const normalized = {
  temperature: requireFiniteNumber(metrics.temperature, '...', { min: -40, max: 85 }),
  humidity: requireFiniteNumber(metrics.humidity, '...', { min: 0, max: 100 }),
  gasLevel: requireInteger(metrics.gasLevel, '...', { min: 0, max: 4095 }),
  gasValid: metrics.gasValid === undefined
    ? true                                      // Tương thích firmware cũ.
    : requireBoolean(metrics.gasValid, '...'), // Explicit false phải được giữ.
  gasUnit: metrics.gasUnit === undefined
    ? 'adc_index'                               // Default contract.
    : metrics.gasUnit,
    motionDetected: requireBoolean(metrics.motionDetected, '...')
  };
  // Tiếp tục kiểm tra gasUnit, gasRaw alias và gasAlarmThreshold rồi return normalized.
  return normalized;
}

function normalizeActuatorStates(actuatorStates) {
  return {
    fanOn: requireBoolean(actuatorStates.fanOn, '...'),
    buzzerActive: requireBoolean(actuatorStates.buzzerActive, '...'),
    alertLedActive: requireBoolean(actuatorStates.alertLedActive, '...'),
    gasAlarmActive: actuatorStates.gasAlarmActive === undefined
      ? false
      : requireBoolean(actuatorStates.gasAlarmActive, '...')
  };
}
```

MQ2 alias consistency:

```js
if (normalized.gasUnit !== MQ2_UNIT) {
  throw new TypeError("metrics.gasUnit must be 'adc_index'"); // Không nhận PPM giả.
}

if (metrics.gasRaw !== undefined && metrics.gasRaw !== null) {
  normalized.gasRaw = requireInteger(metrics.gasRaw, '...', {
    min: MQ2_ADC_MIN,
    max: MQ2_ADC_MAX
  });
  if (normalized.gasRaw !== normalized.gasLevel) {
    throw new TypeError('metrics.gasRaw must equal metrics.gasLevel');
    // Dashboard và anomaly không được nhìn hai giá trị gas khác nhau.
  }
}
```

Object trả về được dựng mới, không spread payload MQTT:

```js
return {
  timestamp: normalizeTimestamp(payload.timestamp), // Omitted -> backend receive time.
  deviceId,
  metrics: normalizeMetrics(metrics),               // Chỉ field đã allow/normalize.
  actuatorStates: normalizeActuatorStates(actuatorStates)
};
```

#### D. Thứ tự ingest

```js
const normalized = validateTelemetryPayload(payload, expectedDeviceId);
// Dòng trên fail thì chưa có DB write, fan, email hoặc anomaly.

const reading = await SensorReading.create(normalized);
// Raw fact được persist trước; create fail thì dừng pipeline.

const anomalies = await processTelemetryForAnomalies(reading);
// NC-01 chỉ phân tích document vừa lưu thành công.

return { reading, anomalies };
// MQTT handler dùng reading để reconcile actuator; caller cũng thấy anomaly mới.
```

Trong `mqttService.handleMqttMessage()`:

```js
const { deviceId, channel } = parseTopic(topic); // Lấy identity/channel từ allowlisted topic.
const payload = parseJsonMessage(message);       // Giới hạn 64 KiB rồi mới JSON.parse.

if (channel === 'telemetry') {
  const result = await ingestTelemetry(payload, deviceId); // Validate + persist + anomaly.
  synchronizeActuatorStates(result.reading.actuatorStates); // Device report thắng optimistic state.
  return result;
}
```

#### E. Historical query có hai chế độ đọc

File: `backend/routes/telemetry.js`.

```js
const { from, to, sensor, limit = 100 } = req.query; // Tất cả ban đầu là string.
const maxPoints = req.query.maxPoints === undefined  // null nghĩa là dùng nhánh limit.
  ? null
  : Number(req.query.maxPoints);
const fromDate = parseDateQuery(from, 'from');        // Parse hoặc throw TypeError.
const toDate = parseDateQuery(to, 'to');
const parsedLimit = Number(limit);                    // Chuẩn hóa trước query.

if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 3600) {
  return res.status(400).json({ success: false, error: '...' });
}
if (maxPoints !== null && (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > 1000)) {
  return res.status(400).json({ success: false, error: '...' });
}
if (maxPoints !== null && (!fromDate || !toDate)) {
  return res.status(400).json({ success: false, error: 'maxPoints requires both from and to' });
}
if (sensor && !SENSOR_FIELDS.has(sensor)) return res.status(400).json({ ... });
if (fromDate && toDate && fromDate > toDate) return res.status(400).json({ ... });
```

Tạo query:

```js
const query = { deviceId }; // Luôn isolate theo thiết bị.
if (fromDate || toDate) {
  query.timestamp = {};
  if (fromDate) query.timestamp.$gte = fromDate; // Inclusive lower bound.
  if (toDate) query.timestamp.$lte = toDate;     // Inclusive upper bound.
}

let readings;
let subSampled = false;

if (maxPoints !== null && fromDate && toDate) {
  const fromMs = fromDate.getTime();
  // +1 tính cả hai endpoint. Neo bucket ở fromDate để range lệch epoch
  // không sinh maxPoints + 1 nhóm.
  const bucketMs = Math.max(1, Math.ceil((toDate.getTime() - fromMs + 1) / maxPoints));
  const pipeline = [
    { $match: query },                         // Lọc device và time range trước.
    { $sort: { timestamp: 1 } },               // $last sẽ là mẫu mới nhất trong bucket.
    { $group: {
      _id: { $floor: { $divide: [
        { $subtract: [{ $toLong: '$timestamp' }, fromMs] },
        bucketMs
      ] } },
      rep: { $last: '$$ROOT' }
    } },
    { $replaceRoot: { newRoot: '$rep' } },     // Trả document thay vì wrapper group.
    { $sort: { timestamp: 1 } }                // Chart order.
  ];
  if (sensor) pipeline.push({ $project: { timestamp: 1, deviceId: 1, [SENSOR_FIELDS.get(sensor)]: 1 } });
  readings = await SensorReading.aggregate(pipeline);
  subSampled = true;
} else {
  let databaseQuery = SensorReading.find(query)
    .sort({ timestamp: -1 })                   // Newest trước để limit chọn đúng cửa sổ.
    .limit(parsedLimit);                       // Tối đa 3600 mẫu full-resolution.
  if (sensor) {
    databaseQuery = databaseQuery.select({
      timestamp: 1,
      deviceId: 1,
      [SENSOR_FIELDS.get(sensor)]: 1
    });
  }
  readings = await databaseQuery;
  readings.reverse();                          // Đổi newest->oldest thành chart order.
}
```

Không truyền `maxPoints`: `DESC -> limit -> reverse` lấy các mẫu full-resolution mới
nhất. Có `maxPoints`: MongoDB phủ toàn bộ cửa sổ bằng tối đa số bucket yêu cầu và
giữ mẫu cuối từng bucket. Response dùng `subSampled` để frontend biết nhánh đã chạy.

#### F. Startup order bảo vệ NC-03

```js
await mongoose.connect(MONGO_URI); // Có DB connection trước.
await ensureSensorReadingsTimeSeries(mongoose.connection.db); // Verify collection trước.
initializeMqttService();           // Sau đó mới subscribe nguồn telemetry.
```

Nếu đảo MQTT lên trước verify, message có thể tới và làm Mongoose tạo/ghi collection
sai semantics trước khi Time Series service kịp kiểm tra.

### 8.4 NC-05 - Từng dòng recipient, SMTP và throttle

#### A. SMTP config là sender, không phải recipient

File: `backend/services/emailService.js`, `getEmailConfig()`.

```js
const requiredValues = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS];
// Ba giá trị tạo một credential set; thiếu một giá trị thì không thể login SMTP.

const credentialsComplete = requiredValues.every(Boolean);
const enabled = parseBoolean(env.EMAIL_ENABLED, credentialsComplete);
// Nếu không khai EMAIL_ENABLED, credentials đầy đủ sẽ tự bật email.

if (enabled && !credentialsComplete) {
  throw new Error('Email alerts are enabled but SMTP config is missing');
  // Fail rõ khi người deploy bật email nhưng cấu hình dở dang.
}

const port = Number(env.SMTP_PORT || 587); // Env là string, 587 là default STARTTLS.
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('...');

return {
  enabled,
  host: env.SMTP_HOST,
  port,
  secure: parseBoolean(env.SMTP_SECURE, port === 465), // 465 mặc định implicit TLS.
  user: env.SMTP_USER,                                // Account gửi/login SMTP.
  password: env.SMTP_PASS,                            // App password, không commit.
  recipient: env.ALERT_RECIPIENT_EMAIL || null,       // Chỉ là bootstrap fallback.
  from: env.SMTP_FROM || `SafeRoom IoT Box <${env.SMTP_USER || '...'}>`
};
```

`SMTP_USER` không quyết định ai nhận mail. Recipient chính đến từ `User.email`.

#### B. Lấy email người dùng đã opt-in

File: `backend/services/userNotificationService.js`.

```js
const users = await User.find({})
  .select('email settings.emailEnabled') // Chỉ đọc hai field phục vụ delivery.
  .lean();                               // Trả plain object, không cần Mongoose document.

const recipients = users
  .filter((user) => user.settings?.emailEnabled !== false)
  // Undefined vẫn enabled để tương thích account tạo trước khi có setting này.
  .map((user) => normalizeEmail(user.email));
  // trim + lowercase + regex validation cho từng profile email.

return {
  hasUsers: users.length > 0,             // Phân biệt chưa có account với tất cả opt-out.
  recipients: [...new Set(recipients)]    // Một địa chỉ chỉ nhận một bản.
};
```

Wiring trong `backend/server.js`:

```js
setEmailRecipientProvider(async (config) => {
  const resolution = await getAlertRecipientResolution(); // Đọc profile tại thời điểm gửi.
  if (resolution.hasUsers) return resolution.recipients;
  // Có user nhưng tất cả tắt -> [] và tuyệt đối không fallback.
  return config.recipient ? [config.recipient] : [];
  // ALERT_RECIPIENT_EMAIL chỉ bootstrap khi database chưa có account nào.
});
```

#### C. `sendAlertEmail()` từ severity đến SMTP success

```js
const severity = String(alert.severity || '').toUpperCase(); // Normalize input.
if (!shouldSendAlertEmail(severity)) {
  return { status: 'ignored', reason: 'severity' };
  // LOW/MEDIUM dừng trước transporter và SMTP.
}

const config = getEmailConfig();           // Đọc sender config hiện tại.
const activeTransporter = getTransporter(config); // Tạo một lần rồi cache.
if (!activeTransporter) return { status: 'disabled' };
```

Resolve recipient:

```js
const providedRecipients = await recipientProvider(config); // Provider từ server.js.
const recipients = normalizeRecipients(providedRecipients);
// Helper kiểm tra Array, trim, bỏ rỗng và loại địa chỉ trùng.

if (recipients.length === 0) {
  return { status: 'skipped', reason: 'no_recipients' }; // Không gọi SMTP.
}
```

Throttle:

```js
const throttleKey = `${alert.deviceId}:${alert.sensorType}`;
// safebox-01:gasLevel độc lập safebox-01:temperature và safebox-02:gasLevel.

const now = nowProvider();               // Injectable clock giúp test đúng 15 phút.
const lastSent = emailThrottleMap.get(throttleKey);

if (lastSent !== undefined && now - lastSent < THROTTLE_WINDOW_MS) {
  return {
    status: 'throttled',
    lastSentAt: new Date(lastSent)
  }; // Không build/send mail thứ hai trong cửa sổ.
}
```

Build header và gửi:

```js
const message = buildAlertMessage({ ...alert, severity });
// Builder tạo text + HTML, escape field động và format timestamp UTC+7.

const recipientHeaders = buildRecipientHeaders(recipients, config.user);
// Helper dùng To cho một người và BCC cho nhiều người.

const result = await activeTransporter.sendMail({
  from: config.from,                          // Sender identity của hệ thống.
  ...recipientHeaders,
  ...message                                  // subject, text, html.
});
// Nếu SMTP reject, await throw và code phía dưới không chạy.

emailThrottleMap.set(throttleKey, now);
// Chỉ commit window sau SMTP success; failed attempt vẫn retry được.

return {
  status: 'sent',
  sentAt: new Date(now),
  messageId: result.messageId,                // ID adapter/SMTP trả về để audit.
  recipientCount: recipients.length
};
```

#### D. Email opt-in trên web

File: `frontend/src/pages/Settings.jsx`.

```jsx
const [emailEnabled, setEmailEnabled] = useState(
  user?.settings?.emailEnabled ?? true // Account cũ chưa có field mặc định nhận mail.
);
const [profileEmail, setProfileEmail] = useState(user?.email || '');
// Địa chỉ chỉ hiển thị; form notification không cho nhập recipient tùy ý.

await saveProfileChanges({
  settings: { emailEnabled } // Chỉ lưu opt-in/opt-out vào user profile.
}, 'Email alert settings updated successfully!');
```

### 8.5 Ranh giới: những code không nên nhận là phần mình viết

Bạn vẫn cần hiểu interface đi qua chúng, nhưng report không gắn ownership Thái Kiệt
cho các phần sau:

| Phần | Lý do không annotate line-by-line ở đây |
|---|---|
| `backend/routes/auth.js` | Authentication scaffold/phần backend chung, không thuộc bốn mã của Kiệt |
| `backend/routes/chatbot.js` | CB-02/luồng chatbot, không thuộc CB-03/NC-01/NC-03/NC-05 |
| `firmware/src/features/gas_safety.cpp` | Edge safety chính của Hoàng; Kiệt chỉ phải hiểu edge alert contract |
| `firmware/src/network/wifi_setup.cpp` | WiFiManager/provisioning không thuộc luồng quạt của Kiệt |
| JSX card/Tailwind layout | Presentation chung; không phải logic quyết định của bốn chức năng |
| OLED/DHT/PIR/MQ2 driver | Phần firmware sensor/hardware của thành viên khác |

Ba file firmware được giải thích trong CB-03 chỉ tại đoạn nhận lệnh fan. Điều đó
không có nghĩa toàn bộ `main.cpp`, `mqtt_service.cpp` hay `actuators.cpp` là code
Kiệt viết. Khi vấn đáp nên nói đúng: Kiệt phụ trách contract fan end-to-end và hiểu
điểm tích hợp firmware hiện tại sau refactor của Hoàng.
