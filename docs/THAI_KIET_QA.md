# Bộ câu hỏi vấn đáp phần Thái Kiệt

Câu trả lời mẫu được viết theo cách nói trực tiếp. Không cần học thuộc từng chữ; cần hiểu luận điểm và chỉ được code minh họa.

## A. Câu hỏi tổng quan

### 1. Em phụ trách phần nào?

Em phụ trách CB-03 điều khiển quạt từ website, NC-01 anomaly detection bằng Z-score và hard rules, NC-03 lưu telemetry bằng MongoDB Time Series, và NC-05 gửi email cảnh báo có throttle.

### 2. Bốn phần này liên hệ với nhau thế nào?

NC-03 nhận và lưu telemetry. NC-01 phân tích chính telemetry đó. NC-01 có thể gọi lại luồng CB-03 để bật fan khi nhiệt độ cao và gọi NC-05 để gửi email khi severity HIGH hoặc CRITICAL.

### 3. Thành phần nào là trung tâm điều phối?

Express backend. Nó nhận REST từ frontend, giao tiếp MQTT với ESP32, ghi MongoDB, chạy anomaly engine và gọi Nodemailer.

### 4. Vì sao không cho frontend kết nối MQTT trực tiếp?

Backend cần giữ MQTT credential, validate quyền người dùng, chuẩn hóa lệnh và tập trung business rule. Nếu frontend kết nối broker trực tiếp thì credential bị lộ và khó kiểm soát quyền publish.

### 5. Điểm an toàn quan trọng nhất của kiến trúc là gì?

Cảnh báo gas nguy hiểm vẫn phải chạy cục bộ trên ESP32 dưới 200 ms, không phụ thuộc backend. Backend bổ sung lưu log và email chứ không thay thế edge safety.

### 6. Em chứng minh code chạy bằng gì?

Em dùng test tự động cho logic và integration simulation, cộng với firmware/frontend build. Riêng latency relay, SMTP thật, EMQX và Atlas phải đo bằng test end-to-end với hạ tầng thật.

### 7. Nếu được làm lại, em ưu tiên cải tiến gì?

Em sẽ thêm command ID và ACK topic cho actuator, chuyển dedupe/throttle state sang Redis hoặc MongoDB để không mất khi restart, và gắn device ownership với user cho mô hình nhiều thiết bị.

## B. CB-03 - Điều khiển quạt

### 8. Luồng bật quạt bắt đầu từ đâu?

Từ `handleActuatorToggle('fan', actuators.fanOn)` trong `Overview.jsx`. Frontend gửi POST tới `/api/v1/control/actuator` với deviceId, actuator và boolean state.

### 9. Request có được xác thực không?

Có. `apiFetch()` gắn JWT vào Authorization header. Backend mount `authenticateToken` trước control router. Không có token trả 401, token sai hoặc hết hạn trả 403.

### 10. Backend validate những gì?

Route yêu cầu actuator và state, actuator phải nằm trong allowlist, state phải là boolean hoặc chuỗi on/off. MQTT service kiểm tra thêm deviceId, actuator và boolean trước khi publish.

### 11. Topic điều khiển là gì?

`safebox/{deviceId}/control`, ví dụ `safebox/safebox-01/control`.

### 12. Payload MQTT là gì?

`{"actuator":"fan","state":"on"}` hoặc state `off`.

### 13. Vì sao dùng QoS 1?

Lệnh điều khiển quan trọng hơn telemetry thông thường, nên cần at-least-once delivery. Bật/tắt là idempotent nên duplicate không gây toggle ngược.

### 14. QoS 1 có bảo đảm quạt đã quay không?

Không. Nó chỉ bảo đảm giao message ở tầng MQTT đến broker/client theo cơ chế QoS. Muốn biết phần cứng đã thực thi phải dùng telemetry phản hồi hoặc ACK riêng từ ESP32.

### 15. Vì sao control message không retained?

Nếu retained, ESP32 kết nối lại có thể nhận lệnh cũ và bật quạt ngoài ý muốn. Control command là event hiện tại nên dùng `retain=false`.

### 16. Nếu MQTT offline thì API trả gì?

`publishControlCommand()` ném lỗi có code `MQTT_OFFLINE`, route chuyển thành HTTP 503. Frontend hiển thị control feedback lỗi và không giả vờ thành công.

### 17. Trạng thái fan trên backend lấy từ đâu?

Ngay sau publish thành công, backend lưu requested state trong `actuatorStateService`. Khi telemetry ESP32 về, snapshot được synchronize lại bằng `actuatorStates` do thiết bị báo cáo.

### 18. Vì sao tách `actuatorStateService` khỏi mock generator?

State này được dùng cả simulation và MQTT thật. Đặt nó trong file mock gây hiểu nhầm ownership. Service riêng làm rõ đây là trạng thái runtime chung; mock generator chỉ sinh dữ liệu.

### 19. Firmware chống payload sai thế nào?

ArduinoJson parse theo buffer và length; JSON lỗi bị bỏ qua. `main.cpp` chỉ định tuyến `fan`, `buzzer`, `alertLed`, nên actuator lạ không tạo tác động. Backend đã validate và chỉ publish state hợp lệ; phía firmware xử lý chuỗi khác `on` theo hướng fail-off.

### 20. Fan ở trạng thái nào khi ESP32 boot?

OFF. `Relay::begin()` cấu hình pin OUTPUT rồi gọi `off()`. Với HL-52S mặc định active-low, OFF tương ứng GPIO 16 HIGH; polarity có thể đổi bằng `RELAY_ACTIVE_LOW`.

### 21. Nếu QoS 1 giao cùng lệnh hai lần thì sao?

Không sao vì command mang trạng thái đích, không phải lệnh toggle. Gọi `Relay::on()` hai lần vẫn cho fan ON.

### 22. Hệ thống có hỗ trợ nhiều device hoàn chỉnh chưa?

Topic, telemetry schema và historical query có deviceId. Tuy nhiên runtime actuator snapshot hiện là một object vì coursework dùng một device chính. Muốn multi-device hoàn chỉnh cần đổi thành `Map<deviceId, actuatorStates>`.

## C. NC-01 - Z-score và anomaly

### 23. Công thức Z-score là gì?

`Z = (x - mean) / standardDeviation`. Code lấy mean và standard deviation từ 30 mẫu trước đó của cùng device và cùng sensor.

### 24. Vì sao chọn N=30?

Đây là kích thước rolling window theo thiết kế dự án: đủ tạo baseline ngắn hạn nhưng vẫn phản ứng với thay đổi môi trường. Với chu kỳ 2 giây, 30 mẫu đại diện khoảng một phút.

### 25. Tại sao dùng 30 mẫu trước thay vì gồm cả mẫu mới?

Mẫu mới là đối tượng cần kiểm tra. Nếu đưa nó vào baseline trước, spike làm mean và variance tăng, khiến Z-score bị giảm và khó phát hiện hơn.

### 26. Điều kiện anomaly thống kê là gì?

Hai điều kiện đồng thời: trị tuyệt đối Z lớn hơn threshold mặc định 3.0 và độ lệch vật lý lớn hơn minimum delta, 1°C cho nhiệt độ hoặc 2% cho độ ẩm.

### 27. Minimum delta để làm gì?

Khi standard deviation rất nhỏ, một dao động rất nhỏ cũng có thể tạo Z-score lớn. Minimum delta lọc các spike toán học nhưng không có ý nghĩa vật lý.

### 28. Z-score áp dụng cho sensor nào?

Chỉ temperature và humidity. `MIN_DELTA` cũng đóng vai trò allowlist; sensor khác trả `ready=false` ngay.

### 29. Vì sao gas không dùng Z-score?

Gas là thông số an toàn có ngưỡng cứng. Gas vượt 600 PPM phải cảnh báo ngay, không thể chờ 30 mẫu hoặc phụ thuộc phân phối thống kê.

### 30. Vì sao motion không dùng Z-score?

Motion là boolean, không phải biến liên tục có phân phối phù hợp để tính mean và standard deviation theo cách này.

### 31. Cold start xử lý thế nào?

Khi buffer dưới 30 mẫu, Z-score chưa ready. Hard bounds vẫn chạy để không bỏ qua nhiệt độ, độ ẩm hoặc gas nguy hiểm.

### 32. Standard deviation bằng 0 thì sao?

Phép chia không xác định nên code trả Z=0 và không tạo statistical anomaly. Hard thresholds vẫn là lớp fallback. Có thể dùng epsilon trong hệ thống nâng cao, nhưng bản này tuân theo rule zero-variance của dự án.

### 33. Code dùng population hay sample standard deviation?

Population standard deviation, variance chia N. Rolling window được xem là toàn bộ baseline runtime hiện tại, không phải mẫu nghiên cứu cần ước lượng tổng thể bằng N-1.

### 34. Buffer có trộn dữ liệu giữa hai thiết bị không?

Không. Key là `deviceId:sensorType`, ví dụ `room-a:temperature` khác `room-b:temperature` và khác `room-a:humidity`.

### 35. Automatic mode có tắt hard threshold không?

Không. Hard threshold luôn được ưu tiên như safety bound. Automatic mode chỉ bật thêm nhánh Z-score khi giá trị chưa vi phạm hard bound.

### 36. Nhiệt độ Z-score âm có bật fan không?

Không. Temperature anomaly vẫn được log và email nếu HIGH, nhưng `autoFan` chỉ true khi giá trị mới lớn hơn mean, tức bất thường theo hướng nóng lên.

### 37. Gas vượt ngưỡng tạo severity gì?

CRITICAL, trigger type `HARD_THRESHOLD_BREACH`. Edge alert từ ESP32 dùng trigger type `EDGE_SAFETY_TRIGGER` nhưng cũng CRITICAL.

### 38. Motion tạo anomaly khi nào?

Chỉ khi `motionDetected=true` và system đang armed. Nó tạo HIGH anomaly, gửi email và publish lệnh bật alert LED.

### 39. Humidity anomaly gửi email không?

Không trong matrix hiện tại vì severity MEDIUM. Nó vẫn được lưu vào `anomaly_logs` và hiện trên dashboard.

### 40. Dedupe key gồm gì?

`deviceId:sensorType:triggerType`. Như vậy hard threshold và edge trigger của cùng gas vẫn là hai loại sự kiện khác nhau.

### 41. Vì sao reserve dedupe key trước action async?

Nếu hai telemetry message vào gần như đồng thời, cả hai có thể cùng vượt kiểm tra trước khi lần đầu ghi DB. Reserve trước giúp chặn race duplicate.

### 42. Nếu action hoặc ghi DB lỗi thì dedupe key thế nào?

Catch sẽ xóa reservation nếu nó vẫn thuộc lần xử lý hiện tại, cho phép message sau retry thay vì bị chặn oan.

### 43. Các anomaly có luôn được tạo đúng thứ tự gas, temp, motion, humidity không?

Không nên phụ thuộc thứ tự hoàn tất vì dùng `Promise.all`. Business correctness nằm ở tập kết quả và nội dung từng anomaly.

### 44. Nếu bật fan thất bại thì anomaly có bị mất không?

Không. Lỗi action được bắt và ghi vào `actionsTaken`; pipeline tiếp tục tạo anomaly log. Đây là graceful degradation.

### 45. Điểm hạn chế của rolling buffer hiện tại là gì?

Buffer nằm trong RAM nên mất khi backend restart và mỗi instance có buffer riêng. Production nhiều instance nên lưu state vào Redis hoặc dùng truy vấn window từ time-series database.

## D. NC-03 - MongoDB Time Series

### 46. Collection telemetry tên gì?

`sensor_readings`.

### 47. `timeField` và `metaField` là gì?

`timestamp` là timeField; `deviceId` là metaField. MongoDB dùng timestamp để tổ chức theo thời gian và deviceId để nhóm metadata series.

### 48. Granularity là gì?

`seconds`, phù hợp dữ liệu ESP32 gửi mỗi khoảng 2 giây.

### 49. Retention là bao lâu?

2,592,000 giây, tương đương 30 ngày.

### 50. TTL có xóa đúng ngay khi đủ 30 ngày không?

Không chính xác từng giây vì TTL monitor chạy nền. Document sẽ được xóa tự động sau khi hết hạn với độ trễ vận hành nhỏ.

### 51. Vì sao Mongoose schema dùng `autoCreate=false`?

Để Mongoose không tạo nhầm collection thường. Backend chủ động tạo Time Series collection với đúng options trước khi ghi.

### 52. Startup kiểm tra collection ra sao?

`ensureSensorReadingsTimeSeries()` đọc metadata. Nếu chưa có thì tạo; nếu có thì so timeField, metaField, granularity và TTL. Sai bất kỳ option nào thì fail fast.

### 53. Vì sao fail fast thay vì tự sửa collection?

Đổi một collection thường thành Time Series không phải update option đơn giản và có nguy cơ mất dữ liệu. Fail fast buộc migration có chủ đích.

### 54. Telemetry được validate trước hay sau khi lưu?

Trước. `validateTelemetryPayload()` chuẩn hóa dữ liệu, kiểm tra type/range và đối chiếu deviceId trong payload với topic.

### 55. Vì sao phải đối chiếu deviceId payload với topic?

Để client không publish vào topic của device A nhưng khai payload device B, gây ghi sai series hoặc giả mạo dữ liệu.

### 56. Tại sao historical query sort DESC rồi reverse?

DESC + limit lấy đúng N mẫu mới nhất. Reverse sau đó trả chúng theo thời gian tăng dần để chart vẽ đúng. ASC + limit sẽ lấy N mẫu cũ nhất.

### 57. Historical API giới hạn bao nhiêu record?

`limit` phải là integer từ 1 đến 1000. Giới hạn ngăn response quá lớn và query thiếu kiểm soát.

### 58. Nếu chỉ hỏi một sensor thì API làm gì?

Route dùng allowlist map sensor sang path schema rồi `.select()` timestamp, deviceId và field sensor đó. Không lấy field tùy ý từ query string.

### 59. Dữ liệu được lưu trước hay phân tích anomaly trước?

Lưu trước, sau đó chạy anomaly engine trên reading đã tạo. Như vậy dữ liệu gốc vẫn có trong DB nếu action phía sau gặp lỗi.

## E. NC-05 - Email

### 60. Thư viện gửi email là gì?

Nodemailer với SMTP transport.

### 61. Severity nào gửi email?

HIGH và CRITICAL. LOW/MEDIUM trả status `ignored` trước khi liên hệ SMTP.

### 62. Throttle window là bao lâu?

15 phút, tức `15 * 60 * 1000` millisecond.

### 63. Throttle key gồm gì?

`deviceId:sensorType`. Nó bảo đảm các cảm biến và thiết bị khác nhau không chặn email của nhau.

### 64. Vì sao key không chứa triggerType?

Mục tiêu là hạn chế email theo vấn đề cảm biến. Nếu cùng gas vừa có hard threshold vừa có edge alert, người dùng vẫn không nên nhận hai chuỗi email riêng dồn dập.

### 65. Thời điểm throttle được ghi khi nào?

Sau khi `sendMail()` thành công. SMTP lỗi không được phép mở một window giả.

### 66. Nếu email bị disable thì anomaly có mất không?

Không. Email service trả status `disabled`; anomaly engine ghi `EMAIL_DISABLED` trong actionsTaken rồi vẫn lưu anomaly.

### 67. SMTP password nằm ở đâu?

Trong environment variable, không commit vào Git. `.env.example` chỉ chứa placeholder.

Địa chỉ gửi (`SMTP_USER`) vẫn do server quản lý, nhưng địa chỉ nhận lấy từ `User.email` đã đăng ký. Người dùng bật hoặc tắt nhận mail tại Settings.

### 68. Email có chống HTML injection không?

Có. Các field động được escape `&`, `<`, `>`, dấu nháy trước khi chèn vào HTML template.

### 69. Transporter được tạo mỗi email không?

Không. Service cache transporter trong runtime để tái sử dụng kết nối/cấu hình.

### 70. Email recipient hiện hỗ trợ nhiều user không?

Có ở mức tài khoản: backend lấy email profile của mọi user có `settings.emailEnabled=true`, loại trùng địa chỉ và dùng BCC khi có nhiều người nhận. Tuy nhiên hệ thống chưa ánh xạ device với owner, nên mọi user đang bật đều nhận anomaly của mọi thiết bị. `ALERT_RECIPIENT_EMAIL` chỉ fallback khi database chưa có user.

### 71. Throttle có tồn tại sau backend restart không?

Không, vì map nằm trong RAM. Muốn bền vững và dùng nhiều instance cần Redis hoặc collection riêng với atomic expiration.

### 72. Tại sao test dùng fake transport và fake clock?

Để test nhanh, lặp lại được và không gửi email thật. Fake clock cho phép nhảy chính xác 15 phút mà không phải chờ thực tế.

## F. Câu hỏi phản biện và cách trả lời trung thực

### 73. Dự án đã hoàn toàn production-ready chưa?

Chưa. Core coursework và automated logic đã hoàn thành. Production cần persistent distributed state, per-user authorization/device ownership, observability, retry policy và end-to-end load/security testing.

### 74. Test pass có chứng minh relay dưới 500 ms không?

Không. Simulation chỉ chứng minh contract phần mềm. TC-06 phải đo từ thao tác web đến relay thật bằng log timestamp hoặc thiết bị đo.

### 75. Test email có chứng minh nhận mail dưới 5 giây không?

Không. Fake SMTP chứng minh logic severity và throttle. TC-05 với SMTP thật mới đo latency giao mail.

### 76. Tại sao không dùng machine learning phức tạp hơn?

Dataset nhỏ, thời gian dự án ngắn và yêu cầu cần giải thích được. Rolling Z-score minh bạch, nhẹ, dễ test và phù hợp ESP32/IoT coursework hơn một model khó hiệu chỉnh.

### 77. Tại sao không chạy Z-score trên ESP32?

Backend đã nhận và lưu lịch sử, có tài nguyên tốt hơn và dễ cập nhật threshold. ESP32 chỉ giữ logic an toàn bắt buộc phải hoạt động offline như gas threshold.

### 78. Nếu MongoDB lỗi thì email/anomaly có chạy không?

Trong pipeline hiện tại `SensorReading.create()` chạy trước anomaly engine, nên ghi telemetry lỗi sẽ dừng xử lý anomaly của message đó. Đây là tradeoff bảo đảm anomaly dựa trên dữ liệu đã persist. Edge gas vẫn an toàn cục bộ trên ESP32.

### 79. Nếu email đã gửi nhưng ghi anomaly log lỗi thì sao?

Action được thực hiện trước khi `AnomalyLog.create()` để lưu đầy đủ `actionsTaken`. Vì vậy có khả năng email đã gửi nhưng DB write sau đó lỗi. Thiết kế production tốt hơn có thể tạo log trạng thái PENDING trước rồi update action hoặc dùng outbox pattern.

### 80. Em sẽ mở file nào đầu tiên nếu được yêu cầu show code?

- CB-03: `backend/routes/control.js`, sau đó `mqttService.js`, `firmware/src/mqtt/mqtt_client.cpp`, `main.cpp` và `actuators/relay.cpp`.
- NC-01: `backend/services/anomalyEngine.js` tại `evaluateZScore` và `processTelemetryForAnomalies`.
- NC-03: `timeSeriesService.js`, `telemetryService.js`, rồi `routes/telemetry.js`.
- NC-05: `emailService.js` tại `sendAlertEmail`.
