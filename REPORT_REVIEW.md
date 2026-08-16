# Các điểm cần sửa trong `REPORT.md`

**Ngày rà soát:** 16/08/2026<br>
**Phạm vi:** Đối chiếu `REPORT.md` với proposal, quy định đồ án và mã nguồn hiện tại sau commit `a3b01cf`.

**Trạng thái sau chỉnh sửa:** Các mục H1, H2, H4, M1, M2, M3, M5 và L2 đã được xử lý trực tiếp trong `REPORT.md`. H3 và M4 vẫn cần ảnh/bằng chứng chạy thật; L1 cần được kiểm tra khi dàn trang PDF.

## Mức cao - phải sửa trước khi nộp

### [x] H1. Cập nhật ngưỡng cảnh báo khí đã lỗi thời

- **Vị trí:** [`REPORT.md:25`](REPORT.md#L25).
- **Hiện trạng:** Báo cáo ghi cố định "ba mẫu liên tiếp vượt ngưỡng 600".
- **Không nhất quán:** Firmware hiện khai báo ngưỡng mặc định `1200` tại [`firmware/src/config.h:44`](firmware/src/config.h#L44), ngưỡng xóa là `1100` tại [`firmware/src/config.h:45`](firmware/src/config.h#L45), đồng thời có thể nhận ngưỡng mới lúc chạy qua [`firmware/src/features/gas_safety.cpp:25`](firmware/src/features/gas_safety.cpp#L25).
- **Cách sửa:** Thay giá trị cố định `600` bằng mô tả ngưỡng cấu hình hiện hành; nếu cần nêu số thì ghi giá trị mặc định hiện tại là `1200 ADC`.
- **Câu gợi ý:** "Sau thời gian làm nóng, ba mẫu liên tiếp vượt ngưỡng cảnh báo đang được cấu hình sẽ kích hoạt buzzer, LED đỏ và cảnh báo OLED; giá trị mặc định hiện tại là 1200 ADC và có thể được backend cập nhật cho ESP32 qua MQTT."

### [x] H2. Xóa hoặc mô tả lại LED xanh

- **Vị trí:** [`REPORT.md:40`](REPORT.md#L40) và [`REPORT.md:49`](REPORT.md#L49).
- **Hiện trạng:** Báo cáo gọi LED xanh là đèn hiển thị trạng thái kết nối/hoạt động.
- **Không nhất quán:** Firmware đã bỏ GPIO 17 và logic LED trạng thái. Pinout hiện chỉ khai báo LED đỏ tại [`firmware/src/config.h:10`](firmware/src/config.h#L10); module actuator chỉ điều khiển quạt, LED cảnh báo và buzzer tại [`firmware/src/actuators/actuators.h:8`](firmware/src/actuators/actuators.h#L8).
- **Cách sửa:** Nếu LED xanh được đấu trực tiếp làm đèn nguồn, đổi thành "LED xanh báo nguồn". Nếu sản phẩm không còn LED xanh, xóa mục này và đổi cụm "các đèn trạng thái" thành "LED đỏ cảnh báo".

### [ ] H3. Hoàn thiện trang bìa và thay toàn bộ placeholder ảnh

- **Vị trí:** [`REPORT.md:9`](REPORT.md#L9), [`REPORT.md:36`](REPORT.md#L36) và [`REPORT.md:78`](REPORT.md#L78).
- **Hiện trạng:** Chưa có trang bìa; 4 ảnh sản phẩm và 6 ảnh website vẫn là vị trí giữ chỗ.
- **Không nhất quán:** Đây vẫn là bản nháp, chưa đủ nội dung để xuất bản nộp chính thức.
- **Cách sửa:** Thêm trang bìa theo proposal; chèn ảnh chạy thật; xóa các câu "CHÈN ẢNH...", "bản nháp" và "theo yêu cầu của người dùng" khỏi bản cuối.

### [x] H4. Thống nhất việc khai báo chức năng có cập nhật hay không

- **Vị trí:** [`REPORT.md:15`](REPORT.md#L15) và cột cuối của bảng chức năng.
- **Hiện trạng:** Báo cáo khẳng định cả 12 chức năng đều không cập nhật so với proposal.
- **Rủi ro:** Proposal có NC-02 cảnh báo khí tại thiết bị nhưng chưa mô tả khả năng chỉnh ngưỡng từ Settings, ghi lại `config.h` và đẩy cấu hình giữ lại xuống ESP32 qua MQTT. Code hiện thực hiện luồng này tại [`backend/routes/control.js:54`](backend/routes/control.js#L54) và [`backend/services/mqttService.js:212`](backend/services/mqttService.js#L212).
- **Cách sửa:** Thống nhất với nhóm/giảng viên một trong hai cách: xem đây là chi tiết hoàn thiện trong phạm vi NC-02 và giữ "Không"; hoặc đánh dấu NC-02 là một chức năng "Có cập nhật" và mô tả phần đồng bộ ngưỡng. Không nên giữ câu khẳng định hiện tại mà không giải thích.

## Mức trung bình - nên sửa để báo cáo chính xác

### [x] M1. Nêu rõ điều kiện bật Z-score và ngưỡng có thể cấu hình

- **Vị trí:** [`REPORT.md:24`](REPORT.md#L24).
- **Hiện trạng:** Nội dung khiến người đọc hiểu Z-score luôn chạy với ngưỡng cố định `|Z| > 3.0`.
- **Không nhất quán:** Hệ thống chỉ tạo cảnh báo thống kê khi `isAutomatic` được bật; ngưỡng `3.0` là mặc định và có thể chỉnh. Điều kiện này nằm tại [`backend/services/anomalyEngine.js:271`](backend/services/anomalyEngine.js#L271) và giao diện bật/tắt nằm tại [`frontend/src/pages/Settings.jsx:218`](frontend/src/pages/Settings.jsx#L218).
- **Cách sửa:** Thêm "khi bật Automatic Mode" và đổi `3.0` thành "ngưỡng mặc định 3.0, có thể cấu hình".

### [x] M2. Làm rõ giới hạn 1.000 mẫu của Dashboard

- **Vị trí:** [`REPORT.md:27`](REPORT.md#L27).
- **Hiện trạng:** Báo cáo nói Dashboard hỗ trợ đầy đủ các khoảng 1h, 6h, 24h và 7d.
- **Giới hạn thực tế:** Frontend yêu cầu tối đa `1000` mẫu tại [`frontend/src/pages/Dashboard.jsx:35`](frontend/src/pages/Dashboard.jsx#L35), backend cũng giới hạn tối đa `1000` tại [`backend/routes/telemetry.js:47`](backend/routes/telemetry.js#L47). Với telemetry mỗi 2 giây, 1.000 mẫu chỉ tương đương khoảng 33 phút 20 giây dữ liệu liên tục.
- **Cách sửa:** Ghi "hiển thị tối đa 1.000 mẫu mới nhất trong khoảng được chọn", hoặc bổ sung downsampling/phân trang trước khi khẳng định biểu đồ đại diện đầy đủ cho 1h-7d.

### [x] M3. Bổ sung điều kiện gửi email

- **Vị trí:** [`REPORT.md:28`](REPORT.md#L28).
- **Hiện trạng:** Mô tả email gần như một hành vi luôn xảy ra.
- **Điều kiện thực tế:** SMTP phải được cấu hình; phải có ít nhất một tài khoản không tắt email; chỉ mức `HIGH` hoặc `CRITICAL` được gửi; giới hạn 15 phút được tính theo `(deviceId, sensorType)`. Logic nằm tại [`backend/services/emailService.js:148`](backend/services/emailService.js#L148) và danh sách người nhận tại [`backend/services/userNotificationService.js:19`](backend/services/userNotificationService.js#L19).
- **Cách sửa:** Thêm cụm "khi SMTP đã được cấu hình và có tài khoản bật nhận cảnh báo".

### [ ] M4. Bổ sung bằng chứng kiểm thử TC-01 đến TC-06

- **Vị trí:** [`REPORT.md:15`](REPORT.md#L15) và phần ảnh từ [`REPORT.md:34`](REPORT.md#L34).
- **Hiện trạng:** Báo cáo nói chỉ xem là kiểm chứng sau khi có bằng chứng TC-01 đến TC-06, nhưng chưa có mục hoặc bảng tập hợp bằng chứng.
- **Cách sửa:** Thêm bảng ngắn gồm mã TC, thao tác, kết quả, thời gian đo và ảnh/log minh chứng; tối thiểu gắn ảnh tương ứng vào chú thích Hình 1-10.

### [x] M5. Ghi giả định hệ số hiểu `K` trong bảng tự đánh giá

- **Vị trí:** [`REPORT.md:106`](REPORT.md#L106) đến [`REPORT.md:112`](REPORT.md#L112).
- **Hiện trạng:** Cả ba thành viên được ghi tổng 10.0 nhưng chưa nói đây là điểm tạm tính với mức hiểu tối đa.
- **Không đầy đủ:** Quy định tính `Điểm CK = (Điểm YCCB + Điểm YCNC + Điểm BC) x K`.
- **Cách sửa:** Thêm chú thích "Điểm tự đánh giá giả định hệ số hiểu K = 100%; điểm chính thức phụ thuộc phần vấn đáp của từng thành viên".

## Mức thấp - cải thiện trình bày

### [ ] L1. Tối ưu bảng chức năng khi xuất PDF

- **Vị trí:** Bảng tại [`REPORT.md:17`](REPORT.md#L17).
- **Vấn đề:** Bốn cột chứa mô tả rất dài, có nguy cơ chữ quá nhỏ hoặc tràn lề khi chuyển sang PDF.
- **Cách sửa:** Dùng `longtable`, đặt cột mô tả dạng co giãn, cho phép ngắt qua trang; nếu cần, xoay ngang riêng các trang chứa bảng.

### [x] L2. Chuẩn hóa thuật ngữ và ngôn ngữ giao diện

- **Vị trí:** [`REPORT.md:24`](REPORT.md#L24), [`REPORT.md:25`](REPORT.md#L25), [`REPORT.md:94`](REPORT.md#L94) và [`REPORT.md:102`](REPORT.md#L102).
- **Vấn đề:** Đang trộn `MQ2`/`MQ-2`, tiếng Việt với `Temperature`, `Gas Level`, `Automatic Mode` mà chưa giải thích.
- **Cách sửa:** Dùng một cách viết thống nhất; lần đầu xuất hiện có thể ghi song ngữ, ví dụ "Chế độ tự động (Automatic Mode)".

## Những phần đã đối chiếu và đang đúng

- [x] Tên môn, học kỳ, nhóm và tên ba thành viên khớp proposal.
- [x] Danh sách 3 chức năng căn bản và 9 chức năng nâng cao khớp proposal.
- [x] Phân công CB/NC cho Khang, Kiệt và Hoàng khớp proposal.
- [x] Tên file dự kiến `06_24127052_24127069_24127378_FINAL.PDF` đúng mã số sinh viên.
- [x] Điều khiển từ xa chỉ áp dụng cho quạt; buzzer và LED đỏ là cảnh báo cục bộ.
- [x] MongoDB Time Series dùng `timestamp`, `deviceId`, granularity giây và lưu 30 ngày.
- [x] API nghiệp vụ được bảo vệ bằng JWT; `/health` và đăng nhập/đăng ký là các luồng công khai có chủ đích.
- [x] Email giới hạn lặp 15 phút theo `(deviceId, sensorType)`.
- [x] Dashboard có nút 1h/6h/24h/7d, Refresh và Export CSV; lưu ý giới hạn 1.000 mẫu ở M2.

## Kết quả xác minh kỹ thuật gần nhất

| Hạng mục | Kết quả |
|---|---|
| Backend `npm test` | **53/53 test đạt** |
| Backend `npm run test:kiet` | **44/44 test đạt và `CB-03 PASS`** |
| Frontend `npm run build` | **Thành công**; có cảnh báo bundle JavaScript lớn hơn 500 kB |
| Firmware `pio run` | **Chưa xác minh trên máy này** vì lệnh PlatformIO `pio` chưa được cài/nhận diện |

## Thứ tự sửa đề xuất

1. Chốt cách khai báo cập nhật cho NC-02.
2. Sửa ngưỡng gas, Z-score và LED xanh.
3. Chụp ảnh sản phẩm, website và bằng chứng TC-01 đến TC-06.
4. Hoàn thiện trang bìa và chú thích hệ số `K`.
5. Dàn lại bảng chức năng rồi mới xuất PDF cuối.
