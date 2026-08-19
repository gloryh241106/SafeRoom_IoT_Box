# Kịch bản demo phần Thái Kiệt

Mục tiêu của kịch bản là tách rõ ba mức bằng chứng:

1. **Unit/integration simulation:** chạy được trên máy không cần ESP32, EMQX, Atlas hay SMTP thật.
2. **Build verification:** chứng minh frontend và firmware biên dịch được.
3. **Physical end-to-end:** chứng minh broker, database, email và relay thật hoạt động với latency yêu cầu.

Không dùng kết quả mức 1 để tuyên bố mức 3 đã pass.

## 1. Chuẩn bị trước demo

### Phần mềm

- Node.js 18 trở lên.
- Dependencies đã cài bằng `npm ci` trong `backend` và `frontend`.
- PlatformIO để build/flash firmware.

### Dịch vụ thật

- MongoDB Atlas connection string.
- EMQX host, username, password và CA certificate.
- SMTP account/app password và email nhận cảnh báo.

### Phần cứng CB-03

- ESP32 DevKit V1.
- Relay HL-52S, signal nối GPIO 16.
- Fan DC dùng nguồn phù hợp, chung ground với relay/ESP32 theo sơ đồ nhóm.
- Không cấp nguồn fan trực tiếp từ GPIO ESP32.

## 2. Demo nhanh không cần phần cứng

Mở PowerShell:

```powershell
cd C:\Users\ASUS\OneDrive\Documents\ChatGPT\Saferoom-IoT\backend
npm run test:kiet
```

Lệnh này chạy test tập trung cho CB-03, NC-01, NC-03, NC-05 và kết thúc bằng mô phỏng fan.

Kết quả bắt buộc:

```text
# fail 0
CB-03 PASS: unauthorized access blocked; authenticated fan ON,
status, and fan OFF succeeded.
```

Nếu có test fail, không tiếp tục tuyên bố chức năng ổn. Đọc tên subtest và sửa nguyên nhân trước.

## 3. Show từng phần bằng test có mục tiêu

### 3.1 CB-03

```powershell
npm run test:cb03
```

Luồng được chứng minh:

```text
request không JWT -> 401
fan ON -> API success -> mock actuator fanOn=true
GET status -> fanOn=true
fan OFF -> API success
```

Điểm phải nói:

> Đây là simulation test cho REST, auth, MQTT abstraction và state. Nó chưa đo relay thật.

### 3.2 NC-01

```powershell
node --test --test-name-pattern="Z-score|hard-rule|gas or motion|deduplicates" test/anomalyEngine.test.js
```

Các bằng chứng cần chỉ:

- 30 mẫu ổn định rồi spike.
- Window tách theo device và metric.
- Zero variance không chia cho 0.
- Minimum delta loại nhiễu nhỏ.
- Gas và motion không dùng Z-score.
- Gas/motion/humidity đi đúng hard-rule matrix.
- Dedupe loại anomaly lặp nhanh.

### 3.3 NC-03

```powershell
node --test test/timeSeriesService.test.js test/telemetryService.test.js test/telemetryRoutes.test.js
```

Các bằng chứng cần chỉ:

- Tạo `sensor_readings` với Time Series options.
- TTL 30 ngày.
- Fail fast khi collection sai loại.
- Validate telemetry và topic/device mismatch.
- Historical query lấy N mẫu mới nhất và trả chronological order.

### 3.4 NC-05

```powershell
node --test test/emailService.test.js
```

Các bằng chứng cần chỉ:

- HIGH gửi email.
- Cùng key bị throttle 15 phút.
- Device hoặc sensor khác có window riêng.
- MEDIUM không gọi SMTP.
- Dynamic HTML được escape.

### 3.5 Integrated NC-01 -> CB-03 -> NC-05

```powershell
node --test --test-name-pattern="runs the Z-score spike" test/anomalyEngine.test.js
```

Test này tạo 30 mẫu nhiệt độ ổn định rồi đưa spike 35°C. Nó kiểm tra:

```text
Z-score > 3
-> tạo Z_SCORE_EXCEEDED / HIGH
-> publish fan ON
-> tạo anomaly document
-> gửi email lần đầu
-> lần gửi cùng key tiếp theo bị throttled
```

## 4. Build verification

### Frontend

```powershell
cd C:\Users\ASUS\OneDrive\Documents\ChatGPT\Saferoom-IoT\frontend
npm run build
```

Kết quả bắt buộc là `built` và exit code 0. Cảnh báo bundle lớn không phải compile failure nhưng nên được ghi nhận.

### Firmware

```powershell
cd C:\Users\ASUS\OneDrive\Documents\ChatGPT\Saferoom-IoT\firmware
pio run
```

Kết quả bắt buộc là `[SUCCESS]`. Ghi lại phần trăm RAM và flash để trả lời câu hỏi tài nguyên.

## 5. Demo thật CB-03 / TC-06

### 5.1 Cấu hình

1. Copy `firmware/include/secrets.example.h` thành `firmware/include/secrets.h`.
2. Điền WiFi, EMQX host, port 8883, username, password và CA certificate.
3. Trong `backend/.env`, đặt:

```env
MOCK_HARDWARE=false
DEVICE_ID=safebox-01
MQTT_BROKER_URL=mqtts://<host>:8883
MQTT_USERNAME=<username>
MQTT_PASSWORD=<password>
```

4. Bảo đảm backend và firmware dùng cùng `DEVICE_ID`.

### 5.2 Chạy

Terminal 1:

```powershell
cd firmware
pio run --target upload
pio device monitor
```

Terminal 2:

```powershell
cd backend
npm start
```

Terminal 3:

```powershell
cd frontend
npm run dev
```

Mở `http://localhost:3000`, đăng nhập và vào Overview.

### 5.3 Bằng chứng cần quay/chụp

1. Dashboard hiển thị MQTT live và device online.
2. Nhấn fan ON.
3. Network tab cho thấy POST control trả 200 và `delivery=published`.
4. Serial Monitor in `[Control] fan=ON`.
5. Relay click và fan quay.
6. Telemetry sau đó báo `fanOn=true`.
7. Lặp lại với OFF.

### 5.4 Đo latency

Mốc bắt đầu: thời điểm nhấn nút hoặc request rời browser.

Mốc kết thúc: thời điểm relay đổi trạng thái, có thể dùng video 60 fps hoặc timestamp đồng bộ giữa frontend và Serial Monitor.

Tiêu chí TC-06:

```text
latency < 500 ms
```

Ghi ít nhất 5 lần ON/OFF, báo median và worst case. Không chỉ đo một lần đẹp nhất.

### 5.5 Chứng minh System Armed không phá edge safety

1. Nhấn DISARMED và xác nhận nút fan bị khóa.
2. Gửi thử POST fan bằng API client; backend phải trả 403, không chỉ dựa vào UI.
3. Xác nhận telemetry card giữ snapshot cũ và anomaly telemetry mới không được tạo.
4. Tạo điều kiện test MQ2 theo quy trình an toàn của nhóm; buzzer/LED/OLED local vẫn phải hoạt động.
5. Re-arm, xác nhận fan điều khiển lại được và mẫu đầu tiên không tạo spike giả do baseline cũ.

Điểm phải nói: DISARMED là backend/UX gate cho remote control và telemetry anomaly,
không phải công tắc vô hiệu hóa cảnh báo khí cục bộ.

## 6. Demo thật NC-03 / TC-02

### 6.1 Kiểm tra ingestion

1. Chạy ESP32, EMQX và backend thật.
2. Mở MongoDB Atlas Data Explorer.
3. Theo dõi `sensor_readings` trong 20–30 giây.
4. Xác nhận timestamp cách nhau khoảng 2 giây và deviceId đúng.
5. Xác nhận metrics và actuatorStates có đủ field bắt buộc.

### 6.2 Kiểm tra collection options

Trong Atlas hoặc mongosh, kiểm tra metadata collection. Kết quả phải tương đương:

```json
{
  "timeseries": {
    "timeField": "timestamp",
    "metaField": "deviceId",
    "granularity": "seconds"
  },
  "expireAfterSeconds": 2592000
}
```

### 6.3 Kiểm tra historical API

Sau khi đăng nhập, lấy JWT và gọi:

```powershell
$token = '<JWT_FROM_LOGIN>'
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod `
  -Uri 'http://localhost:5000/api/v1/telemetry/historical?deviceId=safebox-01&limit=10' `
  -Headers $headers
```

Xác nhận response có tối đa 10 mẫu mới nhất, timestamp tăng dần.

Để chứng minh chế độ giảm mẫu cho một cửa sổ dài, gọi thêm:

```powershell
Invoke-RestMethod `
  -Uri 'http://localhost:5000/api/v1/telemetry/historical?deviceId=safebox-01&from=2026-08-01T00:00:00.000Z&to=2026-08-02T00:00:00.000Z&maxPoints=1000' `
  -Headers $headers
```

Xác nhận `subSampled = $true`, số phần tử không vượt 1000 và timestamp tăng dần.

## 7. Demo thật NC-01 / TC-04

### Phương án an toàn

Không làm nóng DHT22 quá mức hoặc tạo điều kiện nguy hiểm. Dùng mock/test mode để trình bày thuật toán, hoặc dùng một script test telemetry kiểm soát trong môi trường demo riêng.

Trình tự cần chứng minh:

1. Bật automatic Z-score mode.
2. Nạp 30 mẫu ổn định quanh 25°C.
3. Nạp một mẫu spike đủ lớn nhưng vẫn hợp lệ, ví dụ 35°C.
4. Kiểm tra `anomaly_logs` có:

```text
sensorType=temperature
triggerType=Z_SCORE_EXCEEDED
calculatedZScore > 3
severity=HIGH
```

5. Kiểm tra Overview hiển thị anomaly.
6. Kiểm tra action fan ON được publish nếu spike hướng lên.

Không chỉnh threshold gas local của ESP32 để giả lập Z-score; đây là hai cơ chế khác nhau.

## 8. Demo thật NC-05 / TC-05

### 8.1 Cấu hình SMTP

```env
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-user>
SMTP_PASS=<app-password>
SMTP_FROM=SafeRoom IoT Box <smtp-user>
# Chỉ dùng khi database chưa có user:
ALERT_RECIPIENT_EMAIL=<optional-fallback>
SMTP_VERIFY_ON_STARTUP=true
```

Không đưa `.env` hoặc app password lên màn hình quay demo.

### 8.2 Trình tự

1. Đăng nhập bằng tài khoản có email profile thật, mở Settings, bật `Nodemailer Email Alerts` và lưu.
2. Khởi động backend và xác nhận log `[Email] Alerts enabled.`.
3. Tạo một HIGH hoặc CRITICAL anomaly trong môi trường test an toàn.
4. Ghi timestamp anomaly.
5. Xác nhận email đến địa chỉ profile và nội dung đúng device, sensor, observed value, threshold.
6. Đo thời gian từ anomaly tới email; tiêu chí dưới 5 giây theo TC-05.
7. Tạo lại cùng `(deviceId, sensorType)` trong 15 phút.
8. Xác nhận không có email thứ hai và `actionsTaken` ghi `EMAIL_THROTTLED`.
9. Tạo anomaly khác sensor hoặc device và xác nhận vẫn gửi được.

## 9. Bảng ghi kết quả vật lý

| Test | Lần | Bắt đầu | Kết thúc | Latency | Kết quả |
|---|---:|---|---|---:|---|
| TC-06 Fan ON | 1 | | | | |
| TC-06 Fan OFF | 1 | | | | |
| TC-06 Fan ON | 2 | | | | |
| TC-06 Fan OFF | 2 | | | | |
| TC-05 Email | 1 | | | | |
| TC-05 Throttle | 1 | | | N/A | |

## 10. Cách xử lý khi demo lỗi

### API 401/403

- Đăng nhập lại.
- Kiểm tra localStorage có `safebox_token`.
- Không hardcode hoặc tắt auth để né lỗi.

### API 503 MQTT offline

- Kiểm tra `MOCK_HARDWARE=false`.
- Kiểm tra broker URL phải là `mqtts://`.
- Kiểm tra username/password và CA.
- Kiểm tra log backend `connected/subscribed`.

### Backend có MQTT nhưng device offline

- Kiểm tra WiFi ESP32.
- Kiểm tra device ID hai bên.
- Kiểm tra status topic và retained online payload.

### Fan không quay nhưng Serial báo ON

- Kiểm tra relay wiring, common ground và nguồn fan.
- Đo GPIO 16.
- Kiểm tra relay active HIGH hay active LOW thực tế. Code hiện giả định HIGH=ON theo pinout dự án.

### Không có email

- Kiểm tra `EMAIL_ENABLED` và đủ SMTP variables.
- Dùng app password, không dùng password tài khoản thường.
- Kiểm tra severity phải HIGH/CRITICAL.
- Kiểm tra có đang trong throttle window không.

### Không có dữ liệu Atlas

- Kiểm tra MONGO_URI và network access list.
- Kiểm tra MQTT topic phải đúng `safebox/{id}/telemetry`.
- Kiểm tra backend log rejected payload do type/range/device mismatch.

### Gas cao hoặc chỉ số không hợp lệ

- Firmware và web hiển thị chỉ số ADC tương đối, không hiển thị PPM chưa hiệu chuẩn.
- Nếu web hiện `INVALID READING`, đo AO sau cầu chia áp và kiểm tra đúng
  15 kΩ / 10 kΩ, common ground, VCC 5 V và GPIO 34.
- Nếu chỉ số luôn cao, kiểm tra điện áp AO bằng đồng hồ và thử trong không khí
  sạch; không chỉnh số trong phần mềm để ép về một giá trị mong muốn.
- TC-03 phải đo phản hồi local bằng phần cứng. Build pass không chứng minh thời
  gian thực tế dưới 200 ms.

## 11. Bằng chứng dự phòng

Trước ngày vấn đáp nên chuẩn bị:

- Video TC-06 có đồng thời màn hình web, Serial Monitor và relay/fan.
- Ảnh Atlas collection options và vài telemetry documents.
- Email thật có timestamp và nội dung alert.
- Terminal output `npm run test:kiet`.
- Terminal output firmware/frontend build.

Bằng chứng quay trước là phương án dự phòng khi WiFi hoặc cloud lỗi, không thay thế việc hiểu và giải thích code.
