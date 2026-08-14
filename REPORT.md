# BÁO CÁO CUỐI KỲ

## SafeRoom IoT Box - Hộp giám sát phòng và cảnh báo an toàn

**Nhóm thực hiện:** Nhóm 6  
**Môn học:** Vật lý cho Công nghệ thông tin  
**Học kỳ:** HK3/2025-2026

> Mục 2.1 (Trang bìa) không được soạn trong bản nháp này theo yêu cầu của người dùng.

## 2.2. Danh sách các chức năng có trong sản phẩm

**Lưu ý theo yêu cầu báo cáo:** Nhóm sinh viên chỉ được phép Thêm/Xóa/Cập nhật tối đa 01 chức năng so với Thuyết minh đồ án.

Bảng dưới đây được đối chiếu với thuyết minh ban đầu và mã nguồn hiện tại. Cả 12 chức năng vẫn giữ nguyên phạm vi đã đăng ký, do đó không có chức năng nào được khai báo là thêm mới, xóa hoặc cập nhật. Những nội dung cần đo kiểm trên phần cứng được trình bày đúng theo thiết kế hiện có và chỉ được xem là đã kiểm chứng sau khi nhóm bổ sung bằng chứng TC-01 đến TC-06.

| ID | Thông tin chức năng | Sinh viên thực hiện | Có Cập nhật/Thêm mới/Xóa đi so với Thuyết minh dự án? |
|---|---|---|---|
| **Chức năng căn bản** |  |  |  |
| **CB-01** | **Đo nhiệt độ và độ ẩm.** Thiết bị/dịch vụ: DHT22, ESP32, EMQX, Express.js, MongoDB và React. DHT22 đo nhiệt độ, độ ẩm; ESP32 gửi telemetry qua MQTTS; backend kiểm tra và lưu dữ liệu; trang Overview lấy dữ liệu mới nhất qua REST API để hiển thị. | **Nguyễn Huy Hoàng** | **Không.** Giữ nguyên chức năng trong thuyết minh. |
| **CB-02** | **Phát hiện chuyển động.** Thiết bị/dịch vụ: PIR HC-SR501, ESP32, EMQX, Express.js và React. ESP32 đọc trực tiếp trạng thái HIGH/LOW của PIR, gửi cùng gói telemetry và trang Overview hiển thị trạng thái có/không có chuyển động. | **Phùng Bảo Khang** | **Không.** Giữ nguyên chức năng trong thuyết minh. |
| **CB-03** | **Điều khiển quạt từ website.** Thiết bị/dịch vụ: React, Express.js, EMQX, ESP32, relay HL-52S và quạt DC. Người dùng bật/tắt quạt trên Overview; backend publish lệnh đến topic điều khiển; ESP32 nhận lệnh và đóng/ngắt relay. Buzzer và LED đỏ không phải thiết bị điều khiển từ xa. | **Thái Kiệt** | **Không.** Phạm vi đúng với thuyết minh là điều khiển quạt. |
| **Chức năng nâng cao** |  |  |  |
| **NC-01** | **Phát hiện dữ liệu bất thường bằng Z-score.** Dịch vụ: Express.js và MongoDB. Backend duy trì cửa sổ 30 mẫu riêng theo thiết bị và đại lượng; Z-score chỉ áp dụng cho nhiệt độ, độ ẩm với điều kiện `\|Z\| > 3.0`. Khí và chuyển động sử dụng luật/ngưỡng cứng. Sự kiện được lưu vào `anomaly_logs`; hệ thống có cơ chế lọc dao động nhỏ và chống ghi lặp ngắn hạn. | **Thái Kiệt** | **Không.** Giữ nguyên chức năng trong thuyết minh. |
| **NC-02** | **Phát hiện và cảnh báo khí/khói tại thiết bị.** Thiết bị: MQ2, ESP32, OLED SSD1306, LED đỏ và buzzer. ESP32 đọc giá trị ADC thô `0-4095`; sau thời gian làm nóng, ba mẫu liên tiếp vượt ngưỡng 600 kích hoạt buzzer, LED đỏ và cảnh báo OLED bằng tác vụ an toàn cục bộ, không chờ phản hồi mạng. | **Nguyễn Huy Hoàng** | **Không.** Giữ nguyên chức năng trong thuyết minh. |
| **NC-03** | **Lưu trữ dữ liệu cảm biến và lịch sử hoạt động theo thời gian.** Dịch vụ: MongoDB Atlas Time Series và Mongoose. Collection `sensor_readings` dùng `timestamp` làm `timeField`, `deviceId` làm `metaField`, độ chi tiết giây và thời gian lưu 30 ngày. Collection `anomaly_logs` lưu lịch sử bất thường. | **Thái Kiệt** | **Không.** Giữ nguyên chức năng trong thuyết minh. |
| **NC-04** | **Xem dữ liệu lịch sử dưới dạng biểu đồ trên website.** Dịch vụ: MongoDB, Express.js, React và Recharts. Dashboard hỗ trợ các khoảng 1 giờ, 6 giờ, 24 giờ, 7 ngày; hiển thị biểu đồ nhiệt độ, độ ẩm, khí theo thời gian; có làm mới và xuất CSV. | **Phùng Bảo Khang** | **Không.** Giữ nguyên chức năng trong thuyết minh. |
| **NC-05** | **Cảnh báo tự động qua email.** Dịch vụ: Nodemailer/SMTP. Backend gửi email cho tài khoản đã bật thông báo khi phát hiện bất thường mức HIGH hoặc CRITICAL; giới hạn gửi lặp 15 phút theo cặp `(deviceId, sensorType)`. | **Thái Kiệt** | **Không.** Giữ nguyên chức năng trong thuyết minh. |
| **NC-06** | **Chatbot truy vấn thông tin hệ thống.** Dịch vụ: bộ định tuyến điều kiện tự xây dựng trong Express.js và giao diện chat React. Hệ thống nhận câu hỏi về `status`, `gas`, `motion`, `temperature`, `humidity`, `anomalies`, `help`, truy vấn dữ liệu tương ứng và trả kết quả về trang Chatbot. | **Phùng Bảo Khang** | **Không.** Giữ nguyên chatbot theo điều kiện, không bổ sung LLM ngoài phạm vi. |
| **NC-07** | **Đăng ký và đăng nhập tài khoản.** Dịch vụ: React, Express.js, MongoDB, bcryptjs và JWT. Backend kiểm tra dữ liệu, băm mật khẩu, xác thực người dùng và cấp JWT; các API nghiệp vụ được bảo vệ bằng middleware xác thực. | **Nguyễn Huy Hoàng** | **Không.** Giữ nguyên chức năng trong thuyết minh. |
| **NC-08** | **Xây dựng website quản lý sản phẩm.** Dịch vụ: React, Vite, Tailwind CSS, React Router và Express.js. Website gồm các trang Đăng nhập, Đăng ký, Overview, Dashboard, Chatbot và Settings; frontend giao tiếp với backend qua REST API và thăm dò telemetry định kỳ. | **Phùng Bảo Khang** | **Không.** Giữ nguyên chức năng trong thuyết minh. |
| **NC-09** | **Cấu hình WiFi cho thiết bị.** Thiết bị/thư viện: ESP32 và WiFiManager. Khi chưa có mạng phù hợp, thiết bị mở captive portal `Safebox-AP` tại `192.168.4.1`; người dùng nhập WiFi 2.4 GHz, ESP32 lưu thông tin vào NVS, kết nối lại và hiển thị SSID/IP trên OLED. | **Nguyễn Huy Hoàng** | **Không.** Giữ nguyên chức năng trong thuyết minh. |

## 2.3. Ảnh chụp sản phẩm

Hình ảnh trong mục này phải là ảnh sản phẩm thật hoặc ảnh lắp mạch Wokwi. Bản nháp chưa có tệp ảnh nguồn nên các vị trí dưới đây được giữ chỗ; nhóm phải thay bằng ảnh thật trước khi xuất PDF.

### Hình 1. Toàn cảnh sản phẩm SafeRoom IoT Box

> **CHÈN ẢNH SẢN PHẨM TẠI ĐÂY.** Ảnh cần thấy rõ vỏ hộp, màn hình OLED, vùng lấy mẫu của DHT22, PIR HC-SR501, MQ2, quạt và các đèn trạng thái.

**Chú thích thiết bị:**

1. **OLED SSD1306 0.96 inch:** hiển thị trạng thái mạng và cảnh báo khí cục bộ.
2. **DHT22:** đo nhiệt độ và độ ẩm phòng.
3. **PIR HC-SR501:** phát hiện chuyển động.
4. **MQ2:** lấy mẫu khí/khói dưới dạng chỉ số ADC thô.
5. **Quạt DC:** thiết bị được bật/tắt từ website thông qua relay.
6. **LED xanh:** hiển thị trạng thái kết nối/hoạt động bình thường.
7. **LED đỏ:** cảnh báo khí cục bộ.
8. **Buzzer:** phát âm báo khi đường an toàn khí được kích hoạt.

### Hình 2. Bên trong hộp và bộ điều khiển trung tâm

> **CHÈN ẢNH BÊN TRONG HỘP TẠI ĐÂY.** Ảnh cần thấy rõ ESP32 DevKit V1, dây nguồn, bus I2C, dây tín hiệu cảm biến và dây điều khiển các thiết bị đầu ra.

**Chú thích thiết bị:**

- **ESP32 DevKit V1:** thu thập cảm biến, thực thi cảnh báo an toàn tại thiết bị và giao tiếp MQTTS.
- **GPIO 4:** DHT22.
- **GPIO 13:** PIR HC-SR501.
- **GPIO 34:** MQ2 (ADC1).
- **GPIO 16:** relay quạt.
- **GPIO 18:** LED đỏ (cảnh báo).
- **GPIO 19:** buzzer.
- **GPIO 21/22:** OLED I2C SDA/SCL.

### Hình 3. Cụm relay HL-52S và quạt DC

> **CHÈN ẢNH RELAY/QUẠT TẠI ĐÂY.** Ảnh cần ghi rõ chân tín hiệu relay nối GPIO 16, nguồn ngoài cho quạt và dây GND chung. Không cấp nguồn cho quạt từ chân GPIO của ESP32.

### Hình 4. Trạng thái cảnh báo khí tại thiết bị

> **CHÈN ẢNH CẢNH BÁO TẠI ĐÂY.** Ảnh cần thể hiện OLED ghi cảnh báo khí, LED đỏ sáng và buzzer được kích hoạt. Nếu có thể, đặt đồng hồ đo thời gian hoặc khung video TC-03 bên cạnh để chứng minh phản hồi ngoại tuyến.

## 2.4. Ảnh chụp website

Mỗi hình phải ghi rõ tên chức năng được thể hiện. Bản nháp chưa có ảnh chụp từ phiên chạy thật; nhóm phải thay toàn bộ vị trí giữ chỗ dưới đây trước khi nộp.

### Hình 5. Trang Đăng nhập - Chức năng NC-07

> **CHÈN ẢNH TRANG ĐĂNG NHẬP TẠI ĐÂY.** Ảnh thể hiện trường tên đăng nhập, mật khẩu, kiểm tra dữ liệu và liên kết đến trang Đăng ký.

### Hình 6. Trang Đăng ký - Chức năng NC-07

> **CHÈN ẢNH TRANG ĐĂNG KÝ TẠI ĐÂY.** Ảnh thể hiện các trường tên người dùng, email, mật khẩu và kết quả tạo tài khoản.

### Hình 7. Trang Overview - Chức năng CB-01, CB-02, CB-03, NC-01 và NC-02

> **CHÈN ẢNH TRANG OVERVIEW TẠI ĐÂY.** Ảnh nên có dữ liệu telemetry thật: nhiệt độ, độ ẩm, khí ADC, chuyển động, trạng thái MQTT, trạng thái quạt và danh sách bất thường. Chú thích nút điều khiển quạt là CB-03; không ghi buzzer/LED đỏ là điều khiển từ xa.

### Hình 8. Trang Dashboard - Chức năng NC-03 và NC-04

> **CHÈN ẢNH TRANG DASHBOARD TẠI ĐÂY.** Ảnh thể hiện ba biểu đồ Temperature, Humidity, Gas Level, bộ chọn 1h/6h/24h/7d, nút Refresh và Export CSV.

### Hình 9. Trang Chatbot - Chức năng NC-06

> **CHÈN ẢNH TRANG CHATBOT TẠI ĐÂY.** Ảnh cần có ít nhất một câu hỏi của người dùng và phản hồi tương ứng, ví dụ truy vấn trạng thái hệ thống hoặc giá trị khí hiện tại.

### Hình 10. Trang Settings - Chức năng NC-01, NC-05 và NC-07

> **CHÈN ẢNH TRANG SETTINGS TẠI ĐÂY.** Ảnh thể hiện thông tin tài khoản, đổi mật khẩu, bật/tắt email cảnh báo, các ngưỡng an toàn và chế độ Automatic Z-score.

## 2.5. Điểm đồ án do sinh viên tự đánh giá

Dựa trên phân công trong Thuyết minh đồ án và quy định chấm điểm của đồ án cuối kỳ, nhóm tạm đề xuất bảng điểm dưới đây. Cả ba thành viên phải xác nhận lại trước khi xuất bản nộp chính thức.

| STT | Tên thành viên | Điểm cơ bản | Điểm nâng cao | Điểm làm nhóm | Điểm báo cáo | Tổng |
|---:|---|---:|---:|---:|---:|---:|
| 1 | **Phùng Bảo Khang** | 4.0 | 4.0 | 1.0 | 1.0 | **10.0** |
| 2 | **Thái Kiệt** | 4.0 | 4.0 | 1.0 | 1.0 | **10.0** |
| 3 | **Nguyễn Huy Hoàng** | 4.0 | 4.0 | 1.0 | 1.0 | **10.0** |

**Căn cứ phân công:**

- **Phùng Bảo Khang:** CB-02; NC-04, NC-06, NC-08.
- **Thái Kiệt:** CB-03; NC-01, NC-03, NC-05.
- **Nguyễn Huy Hoàng:** CB-01; NC-02, NC-07, NC-09.

**Tên file PDF dự kiến:** `06_24127052_24127069_24127378_FINAL.PDF`.
