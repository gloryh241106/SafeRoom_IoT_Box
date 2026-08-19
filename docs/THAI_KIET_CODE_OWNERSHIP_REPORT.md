# Report code và phạm vi phụ trách của Thái Kiệt

Tài liệu này trả lời ba câu hỏi trước khi học chi tiết:

1. Phần nào trong proposal là trách nhiệm của Thái Kiệt?
2. Luồng code hiện tại chạy qua những file và hàm nào?
3. Phần nào được Codex hỗ trợ triển khai, phần nào là code nền hoặc thay đổi về sau của thành viên khác?

Report này đối chiếu **code nền đã pull tại commit `622b38f`** và các chú thích học
tập trong working tree hiện tại, không mô tả một kiến trúc cũ đã bị refactor.

Nếu chưa biết một hàm là code tự viết hay API thư viện, đọc
[cẩm nang từ số 0](THAI_KIET_BEGINNER_CODE_GUIDE.md) sau report này rồi mới sang
walkthrough từng dòng.

---

## 1. Phạm vi chính thức từ proposal

Proposal giao cho Thái Kiệt bốn mục:

| Mã | Chức năng | Trách nhiệm cốt lõi |
|---|---|---|
| `CB-03` | Điều khiển quạt từ Website | React gửi REST request, backend publish MQTT, ESP32 nhận lệnh và điều khiển relay/quạt |
| `NC-01` | Phát hiện dữ liệu bất thường | Rolling window, Z-score, hard rules, tạo anomaly và kích hoạt action phù hợp |
| `NC-03` | MongoDB Time Series | Tạo đúng collection, validate telemetry, lưu dữ liệu và hỗ trợ truy vấn lịch sử |
| `NC-05` | Cảnh báo Email | Nodemailer, chọn recipient từ user profile, template an toàn và throttle 15 phút |

Nguồn đối chiếu: `06_24127052_24127069_24127378_PROPOSAL.pdf`, các trang chức năng cơ bản/nâng cao và bảng phân công cuối tài liệu.

### Quan hệ giữa bốn phần

```text
ESP32 telemetry
    -> EMQX
    -> mqttService.handleMqttMessage()
    -> telemetryService.ingestTelemetry()
       -> NC-03: lưu SensorReading
       -> NC-01: processTelemetryForAnomalies()
          -> CB-03: có thể publish fan ON khi nhiệt độ cao
          -> NC-05: có thể gửi email khi severity HIGH/CRITICAL
```

Điểm quan trọng khi vấn đáp: bốn mục không phải bốn chương trình rời nhau. `telemetryService.ingestTelemetry()` là điểm nối NC-03 với NC-01; `anomalyEngine.executeActions()` là điểm nối NC-01 với CB-03 và NC-05.

---

## 2. Cách hiểu nhãn "Codex đã code"

Git lưu `author name/email` của máy local, không lưu ai đã gõ từng dòng trong editor. Vì các phiên Codex commit bằng Git identity của bạn, chỉ nhìn `git log` không thể chứng minh tuyệt đối một dòng do người hay Codex gõ.

Report dùng ba mức:

- **Xác nhận chắc chắn**: có bằng chứng trực tiếp trong chuỗi task Codex này.
- **Codex-assisted, độ tin cậy cao**: commit được tạo trong chuỗi làm việc Codex trước đó và nội dung khớp yêu cầu đã giao, nhưng Git vẫn mang identity của bạn.
- **Code thành viên khác / code nền**: commit và lịch sử cho thấy phần đó đến từ Khang hoặc Hoàng; bạn cần hiểu vì nó đi qua luồng của mình nhưng không nên nhận là phần tự triển khai.

### Các commit Codex-assisted cần học

| Commit | Mức xác nhận | Phần đã triển khai |
|---|---|---|
| `e484cfb` | Codex-assisted, độ tin cậy cao | Hoàn thiện fan-control/anomaly pipeline; tạo `mqttService`, `telemetryService`, `timeSeriesService`, test anomaly/email/telemetry/time-series và firmware fan ban đầu |
| `7936e79` | Codex-assisted, độ tin cậy cao | Thêm simulation test CB-03 và chỉnh giao diện điều khiển |
| `1fe90c1` | Codex-assisted, độ tin cậy cao | Hoàn thiện alert workflows, actuator reconciliation, recipient từ user profile, test bảo vệ route và bộ tài liệu vấn đáp ban đầu |
| `5eebe4d` | Xác nhận chắc chắn | Hardening MQ2/telemetry trust boundary; thêm validation raw ADC và chặn dữ liệu gas không hợp lệ tạo cảnh báo giả |
| `0401362` | Xác nhận chắc chắn | Chờ NTP trước MQTTS, log lỗi TLS, kiểm chứng kết nối EMQX thật và tạo cẩm nang PDF/LaTeX |

`350f720` là commit chỉnh báo cáo sau đó dưới identity của bạn. Report này không tự động gắn nhãn Codex cho commit đó vì không có đủ bằng chứng chỉ từ Git.

### Những thay đổi liên quan nhưng thuộc thành viên khác

| Commit | Thành viên | Ảnh hưởng đến phần Kiệt |
|---|---|---|
| `403503a` | Khang | Scaffold backend/frontend, schema và route ban đầu |
| `a2ca458` | Hoàng | Refactor firmware sang các module hiện tại và gỡ remote buzzer/LED |
| `a3b01cf` | Hoàng | Đồng bộ gas threshold backend -> firmware, thêm retained config và bỏ status LED |
| `92629a8` | Hoàng | Sửa `System Armed`: disarmed chặn fan/anomaly, vẫn cho phép re-arm và giữ rolling baseline cập nhật |

Khi vấn đáp, có thể nói: "Em phụ trách luồng CB-03/NC-01/NC-03/NC-05. Sau tích hợp nhóm, Hoàng bổ sung System Armed và đồng bộ threshold; em hiểu contract của các thay đổi này vì chúng đi qua route và anomaly engine của phần em."

---

## 3. Bản đồ code hiện tại

## 3.1 CB-03 - Điều khiển quạt

### Luồng từ web đến GPIO

```text
Overview.handleActuatorToggle('fan', currentState)
  -> apiFetch('/api/v1/control/actuator', POST + JWT)
  -> control.js router.post('/actuator')
  -> publishControlCommand(deviceId, 'fan', boolean)
  -> MQTT topic safebox/{deviceId}/control, QoS 1, retain=false
  -> firmware MqttService::handleControl()
  -> main.cpp handleControl()
  -> Actuators::setFan()
  -> GPIO 16, active-low relay
```

### File và hàm phải học

| File | Hàm/đoạn | Cần hiểu |
|---|---|---|
| `frontend/src/pages/Overview.jsx` | `handleActuatorToggle` | Đảo state, POST request, optimistic UI, chặn fan khi disarmed |
| `frontend/src/api.js` | `apiFetch` | Tự gắn JWT; 401/403 làm request thất bại thay vì giả thành công |
| `backend/routes/control.js` | `POST /actuator` | Validate actuator/state, phân biệt `systemArmed` với actuator vật lý, map lỗi MQTT thành HTTP 503 |
| `backend/services/mqttService.js` | `publishControlCommand` | Boolean ở REST đổi thành `on/off` trên wire; QoS 1 chỉ xác nhận broker nhận |
| `backend/services/actuatorStateService.js` | `updateActuatorState`, `synchronizeActuatorStates` | Requested state là optimistic; telemetry ESP32 mới là confirmed state |
| `firmware/src/network/mqtt_service.cpp` | `handleControl` | Parse JSON và gọi callback; không điều khiển GPIO trực tiếp trong network layer |
| `firmware/src/main.cpp` | `handleControl` | Chỉ chấp nhận `fan`, giữ buzzer/LED ở local safety scope |
| `firmware/src/actuators/actuators.cpp` | `setFan` | Chuyển logical ON/OFF sang mức điện theo active-low |

### Điều Codex đã làm ở phần này

- Xây dựng backend MQTT publish và validation chính trong `e484cfb`.
- Thêm CB-03 simulation trong `7936e79`.
- Tách optimistic state/reconciliation vào `actuatorStateService` trong `1fe90c1`.
- Tạo `apiFetch` dùng chung để request CB-03 có JWT trong `1fe90c1`.
- Kiểm tra live MQTTS/NTP và bổ sung chờ NTP trong `0401362`.

### Điều không được nói quá

- QoS 1 không chứng minh quạt đã quay; nó chỉ chứng minh broker nhận publish.
- Telemetry kế tiếp xác nhận state logic của ESP32, nhưng vẫn không phải cảm biến RPM của quạt.
- `System Armed` hiện chặn remote fan khi disarmed; đây là thay đổi tích hợp mới của Hoàng.

---

## 3.2 NC-01 - Z-score và anomaly engine

### Pipeline quyết định

```text
processTelemetryForAnomalies(reading)
  -> evaluateZScore(temp)
  -> evaluateZScore(humidity)
  -> nếu DISARMED: dừng tạo anomaly, nhưng buffer vẫn đã cập nhật
  -> buildGas/Temperature/Motion/HumidityCandidate()
  -> createAnomalyIfNew()
  -> lưu AnomalyLog trước
  -> executeActions(): fan/email best-effort
```

### File và hàm phải học

| File | Hàm/đoạn | Cần hiểu |
|---|---|---|
| `backend/services/anomalyEngine.js` | `meanAndStdDev` | Population standard deviation trên toàn bộ baseline 30 mẫu |
| cùng file | `evaluateZScore` | Mẫu mới được so với 30 mẫu trước rồi mới push vào buffer |
| cùng file | `build*Candidate` | Gas/motion dùng rule; temp/humidity có hard bounds và optional Z-score |
| cùng file | `createAnomalyIfNew` | Reserve dedupe trước `await`, lưu DB trước action, rollback reservation khi lỗi |
| cùng file | `executeActions` | Auto fan và email là side effect best-effort; lỗi được ghi vào `actionsTaken` |
| `backend/models/Schemas.js` | `AnomalyLogSchema` | Dữ liệu audit của anomaly |
| `backend/routes/anomalies.js` | GET và `DELETE /clear-all` | Clear là resolve, không xóa lịch sử |

### Điều Codex đã làm ở phần này

- Viết phần lớn anomaly engine hiện còn tồn tại trong `e484cfb`.
- Thêm per-device rolling buffers, minimum delta, dedupe/action hardening và test trong `1fe90c1`.
- Bổ sung validation gas để dữ liệu invalid không tạo alert giả trong `5eebe4d`.

### Invariant phải nhớ

- Z-score chỉ áp dụng cho `temperature` và `humidity`.
- `gasLevel` và `motionDetected` không đi qua Z-score.
- Cold start dưới 30 mẫu: chưa có Z-score, nhưng hard threshold vẫn chạy.
- `stdDev === 0`: trả Z-score 0, không chia cho 0.
- `isAutomatic=false`: tắt candidate Z-score, không tắt hard bounds.
- DISARMED hiện dừng tạo anomaly từ telemetry nhưng vẫn cập nhật baseline; edge gas alert từ firmware không bị chặn.

---

## 3.3 NC-03 - MongoDB Time Series

### Luồng ghi và đọc

```text
MQTT telemetry
  -> validateTelemetryPayload()
  -> SensorReading.create(normalized)
  -> processTelemetryForAnomalies(reading)

GET /api/v1/telemetry/historical
  -> validate from/to/sensor/limit/maxPoints
  -> không có maxPoints: newest-first + limit -> reverse
  -> có maxPoints: MongoDB bucket theo thời gian -> lấy mẫu cuối bucket
  -> cả hai nhánh trả chronological order
```

### File và hàm phải học

| File | Hàm/đoạn | Cần hiểu |
|---|---|---|
| `backend/models/Schemas.js` | `SensorReadingSchema` | Shape của document; `autoCreate=false` vì collection cần options đặc biệt |
| `backend/services/timeSeriesService.js` | `ensureSensorReadingsTimeSeries` | Tạo/verify `timeField`, `metaField`, granularity và TTL trước khi MQTT ingest |
| `backend/services/telemetryService.js` | `validateTelemetryPayload` | MQTT là untrusted boundary; validate trước DB/action |
| cùng file | `ingestTelemetry` | Lưu raw fact trước, anomaly chạy sau |
| `backend/routes/telemetry.js` | `/latest`, `/historical` | Full-resolution query, bounded sub-sampling và projection theo sensor |
| `backend/server.js` | startup sequence | Mongo connect -> verify Time Series -> email/MQTT startup |

### Điều Codex đã làm ở phần này

- Tạo `timeSeriesService` và phần lớn `telemetryService` trong `e484cfb`.
- Thêm test collection options, ingestion và historical route qua các commit Codex-assisted.
- Hardening trust boundary raw ADC/device identity trong `5eebe4d`.
- Khang thêm `maxPoints` sub-sampling trong `e5d9f19`; lần tích hợp này giữ tính năng và sửa bucket neo theo `fromDate` để không vượt giới hạn điểm.

### Invariant phải nhớ

- Collection là `sensor_readings`.
- `timestamp` là `timeField`; `deviceId` là `metaField`.
- `granularity='seconds'`; retention 30 ngày qua `expireAfterSeconds`.
- TTL monitor chạy nền, không cam kết xóa đúng từng giây.
- Payload `deviceId` phải khớp device ID lấy từ MQTT topic.
- Dữ liệu được lưu trước khi anomaly side effects chạy.

---

## 3.4 NC-05 - Email Notification

### Luồng gửi

```text
anomalyEngine.executeActions(candidate)
  -> sendAlertEmail(candidate)
     -> kiểm tra HIGH/CRITICAL
     -> getEmailConfig()
     -> recipientProvider() lấy user profile đã bật email
     -> kiểm tra throttle deviceId:sensorType
     -> buildAlertMessage() + escapeHtml()
     -> transporter.sendMail()
     -> chỉ sau thành công mới ghi thời điểm throttle
```

### File và hàm phải học

| File | Hàm/đoạn | Cần hiểu |
|---|---|---|
| `backend/services/emailService.js` | `getEmailConfig` | SMTP secrets chỉ đến từ env; validate enabled/config/port |
| cùng file | `getTransporter` | Cache một transporter thay vì tạo lại mỗi email |
| cùng file | `buildAlertMessage` | Text + HTML, escape dữ liệu động, hiển thị UTC+7 |
| cùng file | `sendAlertEmail` | Severity gate, recipient resolution, throttle, send, commit throttle sau success |
| `backend/services/userNotificationService.js` | `getAlertRecipientResolution` | Lấy email từ user profile, tôn trọng `emailEnabled`, loại trùng |
| `backend/server.js` | recipient provider wiring | Chỉ dùng env fallback khi DB chưa có user nào |
| `frontend/src/pages/Settings.jsx` | email preference form | Người dùng bật/tắt nhận mail; địa chỉ chính là email profile |

### Điều Codex đã làm ở phần này

- Xây dựng Nodemailer adapter, severity gate, template và throttle trong `e484cfb`.
- Thêm recipient theo profile, user preference, UTC+7 và test fake transport/fake clock trong `1fe90c1`.
- Kiểm thử SMTP thật cục bộ trong chuỗi task trước; credential không được commit.

### Invariant phải nhớ

- Chỉ `HIGH` và `CRITICAL` mới đủ điều kiện gửi email.
- Throttle key là `deviceId:sensorType`, cửa sổ 15 phút.
- Chỉ ghi throttle sau SMTP success; lỗi gửi phải cho phép retry.
- Email preference nằm trong user profile; SMTP account là account gửi của hệ thống.
- Throttle nằm trong RAM, mất khi backend restart.

---

## 4. Mười điểm code nên mở đầu tiên khi học

Đọc theo thứ tự sau:

1. `backend/services/telemetryService.js` - `ingestTelemetry`
2. `backend/services/anomalyEngine.js` - `processTelemetryForAnomalies`
3. `backend/services/anomalyEngine.js` - `evaluateZScore`
4. `backend/services/anomalyEngine.js` - `createAnomalyIfNew`
5. `backend/services/emailService.js` - `sendAlertEmail`
6. `backend/routes/control.js` - `POST /actuator`
7. `backend/services/mqttService.js` - `publishControlCommand`
8. `firmware/src/network/mqtt_service.cpp` - `handleControl`
9. `firmware/src/main.cpp` - `handleControl`
10. `firmware/src/actuators/actuators.cpp` - `setFan`

Sau đó mới đọc frontend JSX và schema chi tiết. Thứ tự này đi từ trung tâm backend ra hai biên: database/email và ESP32.

---

## 5. Phân biệt code cần thuộc và code chỉ cần hiểu

### Cần tự giải thích được không nhìn tài liệu

- Luồng CB-03 từ click đến GPIO.
- Vì sao QoS 1 không phải physical ACK.
- Công thức Z-score và vì sao dùng 30 mẫu trước.
- Hard threshold khác Z-score thế nào.
- Dedupe 60 giây khác email throttle 15 phút thế nào.
- Vì sao lưu telemetry/anomaly trước side effects.
- Time Series options và TTL.
- Vì sao throttle chỉ ghi sau email success.

### Chỉ cần biết vị trí và mục đích

- JSX/Tailwind trình bày card.
- Regex email và device ID cụ thể.
- Chi tiết HTML inline style của email.
- Boilerplate Express/Mongoose import/export.
- Hàm reset/test override chỉ phục vụ test isolation.

---

## 6. Giới hạn hiện tại phải trả lời trung thực

- Runtime chủ yếu tối ưu cho một thiết bị chính; chưa có ownership user-device hoàn chỉnh.
- Actuator state không có command ID/ACK topic/RPM feedback.
- Rolling buffer, dedupe và email throttle nằm trong RAM.
- Email fan-out hiện gửi alert toàn hệ thống đến mọi user đã bật email vì chưa có device ownership.
- Test phần mềm không thay thế đo relay `<500 ms`, edge safety `<200 ms` hoặc email thật `<5 s`.
- Threshold gas là raw ADC contract, không phải PPM đã hiệu chuẩn.

Nói đúng giới hạn thường được đánh giá cao hơn khẳng định một tính năng mà code không có.

---

## 7. Các file đã được chú thích để học trực tiếp trong code

Các comment có nhãn `Study map` giải thích contract và thứ tự xử lý. Đây là chú
thích học tập, không phải nhãn ownership; ownership phải đối chiếu theo mục 2.

Chỉ các đoạn thuộc bốn phạm vi của Kiệt mới được chú thích sâu. Với file dùng chung
như `server.js`, `Schemas.js`, `main.cpp` hoặc `mqtt_service.cpp`, comment chỉ nằm ở
điểm nối trực tiếp của CB-03/NC-01/NC-03/NC-05; phần auth, chatbot, WiFi và local
gas-safety không được gắn thành phần Kiệt. Bản giải thích từng statement nằm tại
[mục 8 của walkthrough](THAI_KIET_CODE_WALKTHROUGH.md#thai-kiet-line-by-line).

| Phạm vi | File có Study map | Điểm cần nhìn |
|---|---|---|
| CB-03 frontend | `frontend/src/pages/Overview.jsx` | Click chỉ tạo command và optimistic UI |
| CB-03 API | `backend/routes/control.js` | HTTP trust boundary, DISARMED gate |
| CB-03 state | `backend/services/actuatorStateService.js` | Requested khác reported state |
| CB-03 MQTT | `backend/services/mqttService.js` | QoS 1 không phải physical ACK |
| CB-03 firmware | `firmware/src/network/mqtt_service.cpp` | Parse rồi delegate, network không ghi GPIO |
| CB-03 firmware | `firmware/src/main.cpp` | Allowlist chỉ có fan |
| CB-03 relay | `firmware/src/actuators/actuators.cpp` | Spinlock và active-low mapping |
| NC-01 | `backend/services/anomalyEngine.js` | Baseline, candidate, dedupe, persist, action |
| NC-03 | `backend/services/timeSeriesService.js` | Collection semantics và fail-fast |
| NC-03 | `backend/services/telemetryService.js` | Validate -> persist -> anomaly |
| NC-03 API | `backend/routes/telemetry.js` | Latest bounded window rồi reverse |
| NC-05 | `backend/services/emailService.js` | Severity -> recipients -> throttle -> send |
| NC-05 | `backend/services/userNotificationService.js` | Profile email khác SMTP sender |
| NC-05 web | `frontend/src/pages/Settings.jsx` | Profile email và opt-in |
| Nối các phần | `backend/models/Schemas.js`, `backend/server.js` | Data contracts và startup order |

Để tìm nhanh trong IDE:

```powershell
rg -n "Study map" frontend/src backend firmware/src
```

Đợt đơn giản hóa mới giữ nguyên contract runtime nhưng làm đường đọc ngắn hơn:

- CB-03 dùng kiểm tra trực tiếp `fan` thay cho map/set một phần tử.
- NC-01 dùng early return cho cold start rồi mới đi vào nhánh tính Z-score.
- NC-03 tách `normalizeMetrics()` và `normalizeActuatorStates()` ngay trong cùng file.
- NC-05 tách severity gate, recipient normalization và recipient headers thành helper có tên.

REST, MQTT, MongoDB, SMTP và firmware contract không đổi. Các nhánh bảo vệ như
System Armed, MQTT offline, Time Series fail-fast, legacy telemetry, zero variance,
profile opt-out và throttle 15 phút vẫn được giữ và có regression test.
