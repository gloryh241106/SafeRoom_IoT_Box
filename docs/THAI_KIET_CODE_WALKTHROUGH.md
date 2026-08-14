# Code walkthrough phần Thái Kiệt

Tài liệu này không sao chép toàn bộ source. Nó trích các đoạn quyết định hành vi của CB-03, NC-01, NC-03 và NC-05, rồi giải thích cách các đoạn nối với nhau. Khi vấn đáp, nên mở file thật và tìm theo tên hàm in đậm.

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
  -> SafeboxMqttClient.handleMessage()
  -> RemoteControl.handleCommand()
  -> FanRelay.set()
  -> digitalWrite(GPIO 16 theo RELAY_ACTIVE_LOW)
```

## 2. CB-03 - Điều khiển quạt

### 2.1 Frontend gửi lệnh

File: [`frontend/src/pages/Overview.jsx`](../frontend/src/pages/Overview.jsx)

Đầu file có mapping giữa tên actuator của API và field trong telemetry:

```jsx
const ACTUATOR_STATE_FIELDS = {
  fan: 'fanOn',
  buzzer: 'buzzerActive',
  alertLed: 'alertLedActive'
};
```

Mapping này thay cho ternary lồng nhau. Khi thêm actuator mới, chỉ cần thêm một entry và phần cập nhật optimistic state vẫn dễ đọc.

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

Sau response thành công, UI cập nhật trước khi vòng polling tiếp theo chạy:

```jsx
const stateField = ACTUATOR_STATE_FIELDS[actuator];
if (!stateField) throw new Error(`Unsupported actuator '${actuator}'`);
setTelemetry((prev) => ({
  ...(prev || {}),
  actuatorStates: {
    ...(prev?.actuatorStates || {}),
    [stateField]: targetState
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
if (!ALLOWED_ACTUATORS.has(actuator)) {
  return res.status(400).json({
    success: false,
    error: `Unsupported actuator '${actuator}'`
  });
}

const targetState = parseActuatorState(state);
const publishResult = await publishControlCommand(deviceId, actuator, targetState);
```

Nếu MQTT thật đang offline, service gắn code `MQTT_OFFLINE` và route trả 503. Input sai trả 400. Lỗi không dự kiến trả 500.

### 2.4 Kho trạng thái actuator

File: [`backend/services/actuatorStateService.js`](../backend/services/actuatorStateService.js)

```js
const ACTUATOR_STATE_FIELDS = Object.freeze({
  fan: 'fanOn',
  buzzer: 'buzzerActive',
  alertLed: 'alertLedActive'
});
```

Hàm **updateActuatorState** lưu requested state sau publish:

```js
function updateActuatorState(actuator, state) {
  const stateField = ACTUATOR_STATE_FIELDS[actuator];
  if (!stateField) throw new TypeError(`Unsupported actuator '${actuator}'`);

  currentActuatorStates = {
    ...currentActuatorStates,
    [stateField]: Boolean(state)
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

File: [`firmware/src/connectivity/mqtt_client.cpp`](../firmware/src/connectivity/mqtt_client.cpp)

```cpp
void SafeboxMqttClient::handleMessage(byte* payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;

  const char* actuator = doc["actuator"] | "";
  bool state = doc["state"].is<bool>()
      ? doc["state"].as<bool>()
      : strcmp(doc["state"] | "off", "on") == 0;

  if (_controlCallback) _controlCallback(actuator, state);
}
```

`SafeboxMqttClient` subscribe topic control, parse JSON và đổi state sang boolean. JSON lỗi bị bỏ qua và kết quả hợp lệ được chuyển sang feature điều khiển từ xa.

File: [`firmware/src/features/remote_control.cpp`](../firmware/src/features/remote_control.cpp)

```cpp
void RemoteControl::handleCommand(const char* actuator, bool state) {
  if (strcmp(actuator, "fan") == 0) {
    _fan.set(state); // fan is remote-only
  } else if (strcmp(actuator, "buzzer") == 0) {
    _remoteBuzzer = state;
    if (!_safetyOverride) _buzzer.set(state);
  } else if (strcmp(actuator, "alertLed") == 0) {
    _remoteAlertLed = state;
    if (!_safetyOverride) _alertLed.set(state);
  }
}
```

`RemoteControl` giữ quạt ở phạm vi remote-only và không cho lệnh remote buzzer/LED ghi đè cảnh báo khí. `FanRelay` xử lý riêng polarity; với HL-52S mặc định `RELAY_ACTIVE_LOW=true`, GPIO 16 LOW là ON và HIGH là OFF.

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
if (buffer.length === WINDOW_SIZE) {
  const { mean, stdDev } = meanAndStdDev(buffer);
  if (stdDev === 0) {
    result = { ready: true, zScore: 0, mean, stdDev, isAnomaly: false };
  } else {
    const zScore = (value - mean) / stdDev;
    const isAnomaly = Math.abs(zScore) > systemThresholds.zScoreLimit
      && Math.abs(value - mean) > MIN_DELTA[sensorType];
    result = { ready: true, zScore, mean, stdDev, isAnomaly };
  }
}

buffer.push(value);
if (buffer.length > WINDOW_SIZE) buffer.shift();
```

Thứ tự rất quan trọng: evaluate bằng 30 mẫu cũ, rồi mới roll mẫu mới vào window.

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
const candidates = [
  buildGasCandidate(context),
  buildTemperatureCandidate(context, temperatureStats),
  buildMotionCandidate(context),
  buildHumidityCandidate(context, humidityStats)
].filter(Boolean);

const created = await Promise.all(candidates.map(createAnomalyIfNew));
return created.filter(Boolean);
```

`candidate` là object trung gian mô tả anomaly và hành động cần làm. Chỉ sau dedupe và action handling nó mới thành MongoDB document.

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

Action được bọc `try/catch` riêng. Nếu bật fan hoặc gửi email thất bại, anomaly vẫn được ghi và `actionsTaken` chứa lý do lỗi. Đây là graceful degradation.

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
    lightIntensity: { type: Number, default: null },
    motionDetected: { type: Boolean, required: true }
  },
  actuatorStates: {
    fanOn: { type: Boolean, required: true, default: false },
    buzzerActive: { type: Boolean, required: true, default: false },
    alertLedActive: { type: Boolean, required: true, default: false }
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
- Gas và light là số hữu hạn không âm.
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
const ALERT_SEVERITIES = new Set(['HIGH', 'CRITICAL']);
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
if (!ALERT_SEVERITIES.has(severity)) {
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
if (providedRecipients.length === 0) {
  return { status: 'skipped', reason: 'no_recipients' };
}

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
| `actuatorStateService.test.js` | Mapping actuator và telemetry reconciliation |
| `anomalyEngine.test.js` | N=30, per-device, zero variance, min delta, hard rules, dedupe, integrated action |
| `emailService.test.js` | Severity filter, 15 phút, profile recipients, opt-out, HTML escaping |
| `userNotificationService.test.js` | Chuẩn hóa, loại trùng và lọc user đã tắt email |
| `userRoutes.test.js` | Settings lưu `settings.emailEnabled` đúng field |
| `telemetryService.test.js` | Payload validation, topic/device match, edge alert, actuator confirmation |
| `telemetryRoutes.test.js` | Latest-N query và chronological response |
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
