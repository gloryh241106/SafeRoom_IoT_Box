# Cẩm nang học code Thái Kiệt từ số 0

Tài liệu này dành cho trường hợp chưa quen JavaScript, React, Node.js hoặc Arduino
C++. Nó không giả định người đọc đã biết một tên hàm đến từ đâu.

Mỗi hàm/API được giải thích theo bốn câu hỏi:

1. **Nguồn:** hàm do dự án tự viết hay có sẵn trong ngôn ngữ/framework/thư viện?
2. **Input:** nó nhận dữ liệu gì?
3. **Output:** nó trả về hoặc làm thay đổi điều gì?
4. **Next:** sau lời gọi này, luồng chạy sang đâu?

Phạm vi chỉ gồm:

| Mã | Nội dung |
|---|---|
| `CB-03` | Website điều khiển quạt qua REST, MQTT và ESP32 |
| `NC-01` | Hard rule, rolling Z-score, dedupe và anomaly action |
| `NC-03` | Validate telemetry, MongoDB Time Series và historical API |
| `NC-05` | User email, Nodemailer và throttle 15 phút |

Không xem toàn bộ một file dùng chung là code của Kiệt. Ví dụ `main.cpp` có nhiều
logic của Hoàng; tài liệu chỉ giải thích callback nhận lệnh fan thuộc điểm tích hợp
CB-03.

---

## 1. Nhận biết một hàm đến từ đâu

Tài liệu dùng các nhãn sau:

| Nhãn | Ý nghĩa | Ví dụ |
|---|---|---|
| `[PROJECT]` | Hàm/biến do source của SafeRoom định nghĩa | `apiFetch()`, `evaluateZScore()` |
| `[JS]` | JavaScript built-in, dùng không cần import | `JSON.stringify()`, `Number.isFinite()` |
| `[BROWSER]` | Web API do trình duyệt cung cấp | `fetch()`, `localStorage.getItem()` |
| `[REACT]` | React hook hoặc API React | `useState()`, `useEffect()` |
| `[EXPRESS]` | API route/request/response của Express | `router.post()`, `res.status()` |
| `[MONGOOSE]` | Mongoose model/query API cho MongoDB | `SensorReading.create()`, `.find()` |
| `[MONGODB]` | Native MongoDB database/collection API | `db.createCollection()` |
| `[MQTT.JS]` | MQTT client library của backend Node.js | `mqtt.connect()`, `client.publish()` |
| `[NODEMAILER]` | Thư viện gửi SMTP mail | `createTransport()`, `sendMail()` |
| `[ARDUINOJSON]` | Thư viện parse/build JSON trên ESP32 | `deserializeJson()` |
| `[ARDUINO]` | Arduino/ESP32 framework API | `digitalWrite()`, `pinMode()` |
| `[FREERTOS]` | API đồng bộ/task của hệ điều hành ESP32 | `portENTER_CRITICAL()` |
| `[C/C++]` | Hàm/ngữ pháp chuẩn C/C++ | `strcmp()`, pointer, class method |

### 1.1 Nhìn `import` và `require`

Frontend dùng ES module:

```js
import { useState } from 'react';  // Package react -> [REACT]
import { apiFetch } from '../api'; // File local ../api.js -> [PROJECT]
```

Backend dùng CommonJS:

```js
const express = require('express');              // Package express -> [EXPRESS]
const { SensorReading } = require('../models/Schemas'); // File local -> [PROJECT]
```

Quy tắc nhận biết:

- Tên module như `'react'`, `'express'`, `'mongoose'`, `'mqtt'`, `'nodemailer'` là
  dependency trong `package.json`.
- Đường dẫn bắt đầu bằng `./` hoặc `../` là file do dự án viết.
- `JSON`, `Number`, `Math`, `Date`, `Promise`, `Map`, `Set`, `String`, `Boolean`
  không cần import vì là JavaScript built-in.
- `fetch`, `Headers`, `localStorage`, `setInterval`, `setTimeout` do browser cung cấp.

### 1.2 Nhìn `#include` trong firmware

```cpp
#include <ArduinoJson.h>       // Thư viện cài qua PlatformIO.
#include "actuators.h"         // Header local của dự án.
#include <cstring>             // Thư viện chuẩn C/C++, cung cấp strcmp.
```

Dấu `<...>` thường là framework/thư viện. Dấu `"..."` thường là file trong dự án.

---

## 2. Khái niệm lập trình tối thiểu

### 2.1 Khai báo hàm và gọi hàm

```js
function parseActuatorState(value) {
  return value === 'on';
}

const result = parseActuatorState('on');
```

- `function parseActuatorState...` là **định nghĩa** hàm.
- `parseActuatorState('on')` là **gọi** hàm.
- `'on'` là argument truyền vào parameter `value`.
- `return` kết thúc hàm và đưa kết quả về caller.

### 2.2 Function và method khác nhau thế nào?

```js
parseActuatorState(value); // Function độc lập.
res.json(data);            // Method json nằm trên object res.
```

Phần trước dấu chấm là object. Phần sau dấu chấm là property hoặc method của object
đó.

### 2.3 Object và array

```js
const command = {
  actuator: 'fan',
  state: true
};

const severities = ['HIGH', 'CRITICAL'];
```

- `{}` tạo object gồm các cặp key/value.
- `[]` tạo array có thứ tự.
- `command.state` đọc property `state`.
- `severities[0]` đọc phần tử đầu tiên.

### 2.4 Các kiểu dữ liệu thường gặp

| Kiểu | Ví dụ | Ý nghĩa |
|---|---|---|
| Boolean | `true`, `false` | Bật/tắt, có/không |
| String | `'fan'` | Chuỗi ký tự |
| Number | `25.5`, `30` | Số JavaScript |
| Object | `{ state: true }` | Nhóm field có tên |
| Array | `[1, 2, 3]` | Danh sách có thứ tự |
| `null` | `null` | Chủ động biểu diễn chưa có giá trị |
| `undefined` | `undefined` | Field/argument chưa được cung cấp |

`null` và `undefined` đều có thể nghĩa là thiếu, nhưng code kiểm tra chúng khác nhau.
Ví dụ `state === undefined` không loại bỏ `false`, vì `false` là lệnh fan OFF hợp lệ.

### 2.5 `async`, `Promise` và `await`

Network/database không hoàn tất ngay lập tức. JavaScript biểu diễn kết quả tương lai
bằng Promise.

```js
async function loadData() {
  const response = await fetch('/api/data');
  return response;
}
```

- `async` làm hàm luôn trả Promise.
- `fetch()` trả Promise vì phải chờ network.
- `await` tạm dừng **hàm async hiện tại**, không khóa toàn bộ server/browser.
- Nếu Promise reject, control đi vào `catch` gần nhất.

### 2.6 Callback

Callback là hàm được truyền vào hàm khác để gọi về sau.

```js
setTelemetry((prev) => ({ ...prev, fanOn: true }));
```

`(prev) => ...` là callback. React gọi callback này và truyền state cũ vào `prev`.

Ví dụ MQTT:

```js
mqttClient.publish(topic, payload, options, (error) => {
  if (error) reject(error);
  else resolve();
});
```

MQTT.js gọi callback sau khi publish hoàn tất hoặc thất bại.

### 2.7 `try`, `catch`, `finally`, `throw`

```js
try {
  await sendCommand();
} catch (error) {
  showError(error.message);
} finally {
  unlockButton();
}
```

- `try`: đoạn có thể lỗi.
- `throw`: tạo/chuyển lỗi lên caller.
- `catch`: nhận lỗi.
- `finally`: luôn chạy dù thành công hay lỗi.

### 2.8 Các toán tử xuất hiện nhiều trong project

| Cú pháp | Tên | Ý nghĩa |
|---|---|---|
| `!value` | logical NOT | Đảo boolean |
| `a && b` | logical AND | Đúng khi cả hai đúng; có short-circuit |
| `a || b` | logical OR | Lấy `a` nếu truthy, ngược lại lấy `b` |
| `a ?? b` | nullish coalescing | Chỉ fallback khi `a` là null/undefined |
| `obj?.field` | optional chaining | Thiếu object thì trả undefined thay vì throw |
| `...obj` | object spread | Copy các field sang object mới |
| `condition ? a : b` | ternary | If/else dạng biểu thức |
| `` `${value}` `` | template literal | Chèn giá trị vào string |
| `[fieldName]: value` | computed property | Tên key lấy từ biến |
| `===` | strict equality | So sánh cả giá trị và kiểu |

Ví dụ quan trọng:

```js
const deviceId = telemetry?.deviceId || 'safebox-01';
```

1. `telemetry?.deviceId` thử lấy ID nhưng không lỗi nếu telemetry là null.
2. `||` dùng `'safebox-01'` nếu không có ID.

### 2.9 Vì sao dùng object spread khi cập nhật state?

```js
setTelemetry((prev) => ({
  ...prev,
  actuatorStates: {
    ...prev.actuatorStates,
    fanOn: true
  }
}));
```

React nhận một object mới nên biết cần render lại. Nếu sửa trực tiếp
`prev.actuatorStates.fanOn = true`, React có thể không nhận ra thay đổi và code còn
làm state cũ bị mutate ngoài ý muốn.

---

## 3. Nền tảng React cần biết

### 3.1 Component là gì?

```jsx
export default function Overview() {
  return <div>...</div>;
}
```

`Overview` là React function component. React gọi hàm này để lấy JSX rồi render ra
giao diện. Khi state thay đổi, React gọi component lại để tạo giao diện mới.

### 3.2 `useState()`

```js
const [telemetry, setTelemetry] = useState(null);
```

| Thành phần | Nguồn | Ý nghĩa |
|---|---|---|
| `useState` | `[REACT]` | Hook tạo state cho component |
| `null` | `[JS]` | Giá trị ban đầu |
| `telemetry` | `[PROJECT]` | Biến state hiện tại |
| `setTelemetry` | `[REACT-generated]` | Setter do React tạo, không phải hàm được viết ở file khác |

Đây là điểm rất dễ nhầm: tìm `function setTelemetry` trong project sẽ không thấy,
vì React trả setter đó từ `useState`.

Các setter tương tự:

```text
setPendingActuator, setControlFeedback, setSystemArmed,
setAnomalies, setLoading, setEmailEnabled, setThresholds
```

Tất cả đều do `useState()` tạo.

### 3.3 `useEffect()`

```js
useEffect(() => {
  fetchData();
}, []);
```

- **Nguồn:** `[REACT]`.
- Callback chạy sau khi component render.
- Dependency array `[]` nghĩa là effect chạy một lần sau mount.
- Nếu dependency thay đổi, React chạy effect lại.
- Nếu callback return một function, React dùng function đó để cleanup.

```js
useEffect(() => {
  const interval = setInterval(fetchData, 3000);
  return () => clearInterval(interval);
}, []);
```

`setInterval` và `clearInterval` là `[BROWSER]`. Cleanup tránh timer tiếp tục chạy
sau khi rời trang.

### 3.4 `useRef()`

```js
const hasTelemetryRef = useRef(false);
```

- **Nguồn:** `[REACT]`.
- Trả object `{ current: false }` giữ giá trị qua nhiều render.
- Đổi `.current` không tự làm component render lại.
- Dùng khi cần nhớ một giá trị nội bộ nhưng không cần vẽ lại UI.

### 3.5 Event handler

```jsx
<button onClick={() => handleActuatorToggle('fan', actuators.fanOn)}>
```

- `onClick` là React event prop.
- Arrow function trì hoãn lời gọi tới lúc người dùng click.
- Nếu viết `onClick={handleActuatorToggle(...)}`, hàm sẽ chạy ngay khi render.

Form:

```js
const handleSaveNotifications = async (e) => {
  e.preventDefault();
};
```

`e` là event object do React truyền vào. `preventDefault()` ngăn trình duyệt reload
trang theo hành vi mặc định của `<form>`.

---

## 4. Nền tảng backend cần biết

### 4.1 Route, service và model

```text
Route   -> nhận HTTP, validate quyền/input, chọn status code
Service -> xử lý business logic, MQTT, anomaly, email
Model   -> định nghĩa document và gọi MongoDB qua Mongoose
```

Ví dụ CB-03:

```text
control.js route
  -> mqttService.js service
  -> actuatorStateService.js service
```

Ví dụ NC-03:

```text
telemetryService.js
  -> SensorReading model
  -> anomalyEngine.js
```

### 4.2 Express `req`, `res`, `router`

```js
router.post('/actuator', async (req, res) => {
  const state = req.body.state;
  return res.status(200).json({ success: true });
});
```

| API | Nguồn | Chức năng |
|---|---|---|
| `router.post()` | `[EXPRESS]` | Đăng ký handler cho HTTP POST |
| `req.body` | `[EXPRESS]` | JSON body đã được `express.json()` parse |
| `req.query` | `[EXPRESS]` | Query string sau dấu `?` |
| `req.user` | `[PROJECT middleware]` | User được auth middleware gắn vào request |
| `res.status(code)` | `[EXPRESS]` | Đặt HTTP status và trả lại `res` để chain |
| `res.json(object)` | `[EXPRESS]` | Serialize object thành JSON response |

`res.json()` của Express khác `response.json()` ở browser:

- Backend `res.json(data)` **gửi** JSON.
- Frontend `await response.json()` **đọc/parse** JSON.

### 4.3 Mongoose model và query

```js
const reading = await SensorReading.create(document);
```

- `SensorReading` là model do project tạo bằng `mongoose.model()`.
- `.create()` là `[MONGOOSE]`.
- Nó validate theo schema rồi insert document vào MongoDB.
- Promise resolve thành Mongoose document đã lưu.

Query:

```js
const rows = await SensorReading.find(query)
  .sort({ timestamp: -1 })
  .limit(100);
```

- `.find()` tạo query, chưa chắc đã gửi DB ngay.
- `.sort()` bổ sung thứ tự.
- `.limit()` giới hạn số document.
- `await` làm query execute.

### 4.4 Dependency injection trong project

`anomalyEngine.js` không import trực tiếp `mqttService` để tránh vòng dependency.
Nó giữ một function variable:

```js
let controlPublisher = async () => ({ status: 'unavailable' });
```

Khi server khởi động:

```js
setControlPublisher(publishControlCommand);
```

Từ đó `controlPublisher(...)` thực chất gọi `publishControlCommand(...)`. Đây gọi
là dependency injection: đưa dependency từ bên ngoài vào thay vì hard-code import.

---

## 5. Nền tảng firmware cần biết

### 5.1 Class method và object

```cpp
MqttService mqtt;
mqtt.begin(...);
```

- `MqttService` là class do project định nghĩa.
- `mqtt` là instance tồn tại suốt vòng đời thiết bị.
- `mqtt.begin()` là method của instance.

### 5.2 Pointer `const char*`

```cpp
void handleControl(const char* actuator, bool state)
```

- `const char*` là pointer tới chuỗi C kết thúc bằng byte `\0`.
- `const` nghĩa là hàm không sửa nội dung chuỗi qua pointer này.
- `bool` là true/false trong C++.

### 5.3 `strcmp()`

```cpp
strcmp(actuator, "fan") == 0
```

- **Nguồn:** `[C/C++]`, header `<cstring>`.
- So sánh hai chuỗi C.
- Trả `0` khi hai chuỗi bằng nhau.
- Vì vậy điều kiện trên đúng chỉ khi actuator chính xác là `fan`.

### 5.4 Callback firmware

`MqttService` không biết pin quạt. Nó nhận function pointer/callback từ `main.cpp`:

```cpp
mqtt.begin(..., handleControl, handleGasConfig);
```

Sau khi parse MQTT:

```cpp
if (_controlHandler) _controlHandler(actuator, state);
```

- `_controlHandler` là callback đã lưu.
- `if (_controlHandler)` kiểm tra callback không null.
- Gọi callback đưa policy về `main.cpp`.

### 5.5 Critical section

```cpp
portENTER_CRITICAL(&_mux);
_fanOn = on;
applyLocked();
portEXIT_CRITICAL(&_mux);
```

- **Nguồn:** `[FREERTOS]` trong ESP32 framework.
- Tạm ngăn task/core khác truy cập cùng state trong đoạn ngắn.
- Cần vì local gas-safety task và main/MQTT path có thể dùng actuator state đồng thời.
- Không được giữ lock quanh network hoặc delay dài.

### 5.6 Active-low

Relay active-low nghĩa là mức điện LOW làm relay ON:

```text
Logical fan ON  -> GPIO LOW
Logical fan OFF -> GPIO HIGH
```

Project giấu chi tiết này trong:

```cpp
digitalWrite(pin, (on != activeLow) ? HIGH : LOW);
```

Caller chỉ dùng `setFan(true/false)`, không cần nhớ HIGH/LOW.

---

## 6. CB-03 từ số 0: mọi hàm trong chuỗi điều khiển quạt

### 6.1 Trước hết: trong `Overview.jsx` có những hàm nào?

File `frontend/src/pages/Overview.jsx` không chỉ có `handleActuatorToggle`. Bản đồ:

| Hàm/API | Nguồn | Mục liên quan | Chức năng |
|---|---|---|---|
| `Overview()` | `[PROJECT React component]` | CB-03, nối NC-01/NC-03 | Component trang Overview; khai báo state, effects, handlers và trả JSX |
| `useState()` | `[REACT]` | Tất cả state UI | Tạo state và setter cho component |
| `useRef()` | `[REACT]` | NC-03 display | Nhớ đã từng có telemetry mà không render lại |
| `fetchData()` | `[PROJECT]` | NC-03, NC-01, CB-03 | Poll telemetry, anomaly và trạng thái MQTT/actuator |
| Effect load threshold | `[REACT + PROJECT callback]` | NC-01 | Lấy gas threshold runtime/backend và threshold edge |
| Effect polling | `[REACT + BROWSER timer]` | NC-03, CB-03 | Gọi `fetchData` mỗi 3 giây và cleanup interval |
| `handleActuatorToggle()` | `[PROJECT]` | CB-03, System Armed | Gửi lệnh fan/armed và cập nhật UI |
| `handleDeleteAllAnomalies()` | `[PROJECT]` | NC-01 UI | Gọi API resolve toàn bộ anomaly; không xóa audit DB |
| `formatMetric()` | `[PROJECT imported helper]` | Hiển thị | Format sensor number, không ra quyết định anomaly |
| `getRawGasValue()` | `[PROJECT imported helper]` | NC-03 display | Đọc gasRaw hoặc compatibility gasLevel |
| `hasValidRawGasValue()` | `[PROJECT imported helper]` | NC-03 display | Kiểm tra dữ liệu gas đủ hợp lệ để hiển thị |
| `rawGasProgressPercent()` | `[PROJECT imported helper]` | Hiển thị | Đổi raw ADC thành phần trăm thanh progress, không phải PPM |

Không cần học Tailwind hoặc Lucide icon để giải thích CB-03. `Fan`, `Bell`,
`ShieldCheck` là React icon component từ package `lucide-react`, chỉ phục vụ hình ảnh.

### 6.2 `fetchData()` gọi những gì?

`fetchData()` là `[PROJECT]`, khai báo bằng arrow function async:

```js
const fetchData = async () => { ... };
```

Các lời gọi trong hàm:

| Lời gọi | Nguồn | Input | Output/tác dụng |
|---|---|---|---|
| `apiFetch('/api/v1/telemetry/latest')` | `[PROJECT]` | URL API | Promise của Browser `Response` |
| `telRes.json()` | `[BROWSER Response]` | Không có | Promise parse response body thành object JS |
| `apiFetch('/api/v1/control/status?...')` | `[PROJECT]` | Device ID | Lấy systemArmed, actuator snapshot, MQTT/LWT |
| `encodeURIComponent()` | `[JS global/Web]` | Chuỗi deviceId | Encode ký tự đặc biệt an toàn cho query string |
| `apiFetch('/api/v1/anomalies?...')` | `[PROJECT]` | Filter unresolved | Lấy anomaly chưa resolve |
| `setAnomalies()` | `[REACT-generated]` | Array anomaly | Đổi state, React render danh sách mới |
| `setSystemArmed()` | `[REACT-generated]` | Boolean | Đổi trạng thái nút/banner trên UI |
| `setTelemetry()` | `[REACT-generated]` | Telemetry object | Đổi cards và actuator state đang hiển thị |
| `setHardwareMode()` | `[REACT-generated]` | `'real'`, `'mock'`... | Hiển thị backend đang dùng MQTT thật/mock |
| `setConnectionState()` | `[REACT-generated]` | online/degraded/offline | Quyết định enable nút fan và badge |
| `console.error()` | `[BROWSER console]` | Message, Error | In lỗi vào DevTools, không gửi response cho user |
| `setLoading()` | `[REACT-generated]` | Boolean | Tắt loading trong `finally` dù request lỗi |

`fetchData()` là nơi telemetry từ NC-03 quay lại xác nhận optimistic fan state của
CB-03. Nó không publish MQTT.

### 6.3 `handleActuatorToggle()` và nguồn của từng hàm

Đoạn mở đầu:

```js
const handleActuatorToggle = async (actuator, currentState) => {
```

- `[PROJECT]`: do project viết trong `Overview.jsx`.
- Input `actuator`: `'fan'` hoặc `'systemArmed'`.
- Input `currentState`: boolean đang hiển thị.
- Output: Promise resolve `undefined`; tác dụng chính là request và đổi React state.

Bảng lời gọi:

| Lời gọi/cú pháp | Nguồn | Giải thích từ số 0 |
|---|---|---|
| `setPendingActuator(actuator)` | `[REACT-generated]` | Setter từ `useState`; disable nút trong lúc chờ |
| `setControlFeedback(null)` | `[REACT-generated]` | Xóa message cũ |
| `!systemArmed` | `[JS operator]` | Đảo true/false để kiểm tra DISARMED |
| `return` | `[JS syntax]` | Kết thúc handler ngay, không gọi backend |
| `!currentState` | `[JS operator]` | Tạo desired final state |
| `apiFetch(...)` | `[PROJECT]` | Wrapper của browser `fetch`, tự gắn JWT |
| `JSON.stringify(object)` | `[JS]` | Serialize object thành JSON string để gửi HTTP body |
| `await` | `[JS async syntax]` | Chờ Promise trong handler async |
| `res.json()` | `[BROWSER Response]` | Đọc body response và parse JSON |
| `res.ok` | `[BROWSER Response property]` | True nếu HTTP status trong khoảng 200-299 |
| `new Error(message)` | `[JS]` | Tạo error object để chuyển sang `catch` |
| `isSystemArmedCommand` | `[PROJECT boolean]` | Tính một lần để hai nhánh sau không lặp phép so sánh |
| `setTelemetry(callback)` | `[REACT-generated]` | React gọi callback với state cũ rồi lưu object mới |
| `...(prev || {})` | `[JS spread + OR]` | Copy field cũ; fallback object rỗng nếu null |
| `fanOn: targetState` | `[PROJECT field + JS object]` | Ghi trực tiếp field duy nhất web được điều khiển |
| `console.error(...)` | `[BROWSER console]` | Log chi tiết kỹ thuật |
| `finally` | `[JS syntax]` | Luôn mở khóa nút bằng `setPendingActuator(null)` |

### 6.4 Mở tiếp `apiFetch()`

`apiFetch` không phải hàm React hay browser có sẵn. Nó là `[PROJECT]` trong
`frontend/src/api.js`.

```js
export function apiFetch(input, options = {}) {
  const token = localStorage.getItem('safebox_token');
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...options, headers });
}
```

| Lời gọi | Nguồn | Chức năng |
|---|---|---|
| `localStorage.getItem()` | `[BROWSER]` | Đọc JWT string đã lưu theo key; trả null nếu không có |
| `new Headers()` | `[BROWSER]` | Tạo object quản lý HTTP headers, normalize tên/value |
| `headers.set()` | `[BROWSER Headers]` | Ghi hoặc thay header Authorization |
| `fetch()` | `[BROWSER]` | Gửi HTTP request; trả Promise của `Response` |

`apiFetch()` không tự kiểm tra `res.ok` và không tự parse JSON. Caller như
`handleActuatorToggle()` chịu trách nhiệm hai việc đó.

### 6.5 Backend nhận request: `router.post()`

`router.post('/actuator', handler)` là `[EXPRESS]`. Khi request đúng method/path,
Express gọi handler với `req` và `res`.

Các lời gọi quan trọng trong handler:

| Lời gọi | Nguồn | Input | Output/tác dụng |
|---|---|---|---|
| `parseActuatorState(state)` | `[PROJECT]` | Boolean hoặc `'on'/'off'` | Boolean chuẩn hóa hoặc throw TypeError |
| `setSystemArmed(value)` | `[PROJECT NC-01]` | Boolean | Đổi process policy, không MQTT |
| `isSystemArmed()` | `[PROJECT NC-01]` | Không có | Trả boolean policy hiện tại |
| `actuator !== 'fan'` | `[JS comparison]` | Tên actuator | Reject mọi actuator vật lý ngoài fan |
| `publishControlCommand(...)` | `[PROJECT CB-03]` | Device, fan, boolean | Publish MQTT hoặc throw |
| `getCurrentActuatorStates()` | `[PROJECT]` | Không có | Trả copy optimistic/reported snapshot |
| `res.status(code)` | `[EXPRESS]` | HTTP status | Đặt status, trả lại res để chain |
| `res.json(object)` | `[EXPRESS]` | JS object | Serialize và gửi JSON response |
| `err instanceof TypeError` | `[JS operator/class]` | Error object | Kiểm tra loại lỗi để map 400 |

#### `parseActuatorState()` là gì?

Đây là `[PROJECT]`, không phải thư viện:

```js
function parseActuatorState(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'on') return true;
  if (value === 'off') return false;
  throw new TypeError('...');
}
```

- `typeof` là `[JS operator]` trả chuỗi mô tả kiểu.
- `TypeError` là class lỗi built-in của JavaScript.
- Hàm chỉ normalize; nó không điều khiển quạt.

### 6.6 Backend publish MQTT

`publishControlCommand()` là `[PROJECT]` trong `mqttService.js`.

| Lời gọi | Nguồn | Chức năng |
|---|---|---|
| `DEVICE_ID_PATTERN.test(deviceId)` | `[JS RegExp]` | Kiểm tra ID theo regular expression |
| `actuator !== 'fan'` | `[JS comparison]` | Kiểm tra contract chỉ cho phép fan |
| `isMockHardware()` | `[PROJECT]` | Đọc config để chọn mock hay broker thật |
| `new Error()` | `[JS]` | Tạo lỗi MQTT offline |
| `JSON.stringify()` | `[JS]` | Tạo payload `{"actuator":"fan","state":"on"}` |
| `new Promise(...)` | `[JS]` | Bọc MQTT callback để có thể dùng await |
| `mqttClient.publish()` | `[MQTT.JS]` | Publish topic/payload/options tới broker |
| `resolve()` | `[JS Promise callback]` | Đánh dấu Promise thành công |
| `reject(error)` | `[JS Promise callback]` | Đánh dấu Promise thất bại |
| `updateActuatorState()` | `[PROJECT]` | Ghi optimistic fanOn sau callback thành công |

`mqttClient.publish(..., { qos: 1, retain: false }, callback)`:

- QoS 1: broker/client dùng at-least-once.
- `retain=false`: broker không lưu lệnh quạt cũ.
- Callback thành công: MQTT.js không báo lỗi publish.
- Nó không biết relay hoặc motor có thực sự chạy.

### 6.7 `updateActuatorState()` và `synchronizeActuatorStates()`

Cả hai là `[PROJECT]` trong `actuatorStateService.js`.

| Hàm | Ai gọi? | Ý nghĩa |
|---|---|---|
| `updateActuatorState()` | Sau publish hoặc mock command | Requested/optimistic state |
| `synchronizeActuatorStates()` | Khi ESP32 telemetry về | Device-reported state, có quyền ghi đè |
| `getCurrentActuatorStates()` | Route/status/mock | Trả object copy cho caller |

Built-ins bên trong:

- `Boolean(value)` là `[JS]`, convert giá trị thành true/false.
- Object spread `{ ...currentActuatorStates }` là cú pháp copy nông.
- `Object.freeze()` là `[JS]`, ngăn sửa object trạng thái mặc định ngoài ý muốn.

### 6.8 Firmware nhận command

`deserializeJson(document, payload, length)`:

- Nguồn `[ARDUINOJSON]`.
- Input `document`: nơi nhận cây JSON.
- Input `payload`: pointer byte do PubSubClient đưa vào callback.
- Input `length`: số byte hợp lệ.
- Return error code/object có thể dùng trong `if`; parse lỗi thì return.

ArduinoJson document API:

| API | Nguồn | Chức năng |
|---|---|---|
| `document["actuator"]` | `[ARDUINOJSON]` | Lấy JSON variant theo key |
| `variant \| ""` | `[ARDUINOJSON operator]` | Dùng default nếu key thiếu/sai kiểu |
| `.is<bool>()` | `[ARDUINOJSON]` | Kiểm tra variant đang là boolean |
| `.as<bool>()` | `[ARDUINOJSON]` | Convert variant thành bool |

`strcmp()` là `[C/C++]`, `actuators.setFan()` là `[PROJECT]`, còn
`portENTER_CRITICAL` là `[FREERTOS]` và `digitalWrite` là `[ARDUINO]`.

### 6.9 Call chain CB-03 hoàn chỉnh

```text
[REACT event] onClick
  -> [PROJECT] handleActuatorToggle
     -> [PROJECT] apiFetch
        -> [BROWSER] fetch
           -> [EXPRESS] router.post('/actuator')
              -> [PROJECT] parseActuatorState
              -> [PROJECT] publishControlCommand
                 -> [MQTT.JS] mqttClient.publish
                    -> EMQX broker
                       -> [PubSubClient callback on ESP32]
                          -> [ARDUINOJSON] deserializeJson
                          -> [PROJECT] MqttService::handleControl
                          -> [PROJECT] main.cpp handleControl
                          -> [PROJECT] Actuators::setFan
                          -> [FREERTOS] critical section
                          -> [ARDUINO] digitalWrite(GPIO 16)
```

Khi thầy chỉ vào một tên hàm, trả lời theo mẫu:

> `mqttClient.publish` không phải hàm em tự viết; nó là API của MQTT.js. Code em
> chuẩn bị topic/payload/options rồi dùng callback của thư viện để biết publish có
> lỗi hay không. Sau broker, ESP32 nhận message bằng PubSubClient và callback dự án
> mới parse rồi ghi relay.

---

## 7. NC-03 từ số 0: telemetry và MongoDB Time Series

### 7.1 Bản đồ file và hàm

| File | Hàm/đối tượng | Nguồn | Vai trò |
|---|---|---|---|
| `mqttService.js` | `handleMqttMessage()` | `[PROJECT]` | Phân luồng telemetry/alert/status từ broker |
| `telemetryService.js` | `validateTelemetryPayload()` | `[PROJECT]` | Validate và normalize snapshot |
| `telemetryService.js` | `ingestTelemetry()` | `[PROJECT]` | Validate -> MongoDB -> anomaly |
| `Schemas.js` | `SensorReading` | `[PROJECT model qua MONGOOSE]` | Data contract của document telemetry |
| `timeSeriesService.js` | `ensureSensorReadingsTimeSeries()` | `[PROJECT]` | Tạo/verify collection semantics |
| `telemetry.js` route | `/latest`, `/historical` | `[EXPRESS + PROJECT handler]` | Đọc dữ liệu cho frontend |
| `server.js` | `startServer()` | `[PROJECT]` | Bảo đảm DB/collection sẵn sàng trước MQTT |

### 7.2 `handleMqttMessage()` gọi gì?

```js
async function handleMqttMessage(topic, message) {
  const { deviceId, channel } = parseTopic(topic);
  const payload = parseJsonMessage(message);
  ...
}
```

| Lời gọi | Nguồn | Input | Output |
|---|---|---|---|
| `parseTopic(topic)` | `[PROJECT]` | MQTT topic string | `{ deviceId, channel }` hoặc throw |
| `TOPIC_PATTERN.exec(topic)` | `[JS RegExp]` | String | Match array hoặc null |
| `parseJsonMessage(message)` | `[PROJECT]` | Node `Buffer` | Parsed JS object hoặc throw |
| `message.length` | `[NODE Buffer property]` | Không gọi hàm | Số byte payload |
| `message.toString('utf8')` | `[NODE Buffer]` | Encoding | Chuyển bytes thành string |
| `JSON.parse()` | `[JS]` | JSON string | JS object hoặc SyntaxError |
| `ingestTelemetry()` | `[PROJECT NC-03]` | Payload, topic device ID | `{ reading, anomalies }` |
| `synchronizeActuatorStates()` | `[PROJECT CB-03]` | Reported states | Reconcile optimistic state |
| `validateEdgeAlert()` | `[PROJECT]` | Edge payload | Alert object đã chuẩn hóa |
| `processEdgeAlert()` | `[PROJECT NC-01]` | Valid edge alert | AnomalyLog hoặc null dedupe |
| `deviceStatuses.set()` | `[JS Map]` | Device ID, status object | Lưu LWT/runtime status |

`Buffer` là class của Node.js dùng giữ binary bytes. Browser không dùng Node Buffer
cho `fetch Response`; backend MQTT dùng Buffer vì message đi từ network socket.

### 7.3 Các helper validation là project code hay thư viện?

Trong `telemetryService.js`, các hàm sau đều là `[PROJECT]`:

| Hàm | Nó dùng built-in nào? | Chức năng |
|---|---|---|
| `requireObject()` | `Array.isArray()` | Bắt buộc object thường, loại null/array |
| `requireFiniteNumber()` | `Number.isFinite()` | Bắt buộc number hữu hạn trong min/max |
| `requireInteger()` | `Number.isInteger()` | Bắt buộc integer trong min/max |
| `requireBoolean()` | `typeof` | Bắt buộc true/false thật |
| `normalizeTimestamp()` | `new Date()`, `getTime()`, `Number.isNaN()` | Parse ngày hoặc dùng thời điểm hiện tại |
| `validateTelemetryPayload()` | Các helper trên | Dựng document normalized |

#### `Array.isArray()`

- Nguồn `[JS]`.
- Trả true nếu value là array.
- Cần vì trong JavaScript `typeof []` cũng là `'object'`; chỉ dùng `typeof` sẽ nhận
  nhầm array làm metrics object.

#### `Number.isFinite()`

- Nguồn `[JS]`.
- Chỉ true với number không phải `NaN`, `Infinity`, `-Infinity`.
- Không tự convert string `'25'` thành number. MQTT phải gửi JSON number đúng kiểu.

#### `Number.isInteger()`

- Nguồn `[JS]`.
- Gas raw ADC phải là số nguyên, nên `25.5` bị reject dù vẫn finite.

#### `new Date(value)` và `.getTime()`

- Nguồn `[JS]`.
- Constructor thử parse timestamp.
- Invalid Date có `.getTime()` trả `NaN`.
- `Number.isNaN(...)` phát hiện trường hợp đó.

### 7.4 `validateTelemetryPayload()` từng dependency

```js
requireObject(payload, 'telemetry payload');
```

Gọi helper `[PROJECT]`. Nếu invalid, helper `throw new TypeError`; từ đó MQTT
handler log/reject message và không ghi DB.

```js
if (!DEVICE_ID_PATTERN.test(deviceId)) ...
```

- `DEVICE_ID_PATTERN` là RegExp do project khai báo.
- `.test()` là method `[JS RegExp]`.
- Nó bảo đảm ID chỉ có chữ, số, underscore, hyphen và giới hạn độ dài.

```js
const metrics = requireObject(payload.metrics, 'metrics');
const actuatorStates = requireObject(payload.actuatorStates, 'actuatorStates');

return {
  timestamp: normalizeTimestamp(payload.timestamp),
  deviceId,
  metrics: normalizeMetrics(metrics),
  actuatorStates: normalizeActuatorStates(actuatorStates)
};
```

`normalizeMetrics()` và `normalizeActuatorStates()` đều là `[PROJECT]` trong cùng
file. Chúng tạo object mới chỉ chứa field allowlisted; không có thư viện nào tự
sanitize payload ở đây. Tách hai helper làm hàm chính chỉ còn: kiểm tra envelope,
xác nhận device ID, rồi chuẩn hóa hai nhóm dữ liệu.

```js
metrics.gasValid === undefined ? true : requireBoolean(...)
```

Đây là ternary `[JS syntax]`. Firmware cũ thiếu field được coi là true; nếu field có
mặt thì phải là boolean thật.

### 7.5 `ingestTelemetry()` là điểm nối NC-03 -> NC-01

```js
async function ingestTelemetry(payload, expectedDeviceId) {
  const normalized = validateTelemetryPayload(payload, expectedDeviceId);
  const reading = await SensorReading.create(normalized);
  const anomalies = await processTelemetryForAnomalies(reading);
  return { reading, anomalies };
}
```

| Lời gọi | Nguồn | Điều gì xảy ra? |
|---|---|---|
| `validateTelemetryPayload()` | `[PROJECT NC-03]` | Pure validation/normalization, chưa side effect |
| `SensorReading.create()` | `[MONGOOSE via PROJECT model]` | Schema validate và insert MongoDB |
| `processTelemetryForAnomalies()` | `[PROJECT NC-01]` | Phân tích document đã persist |

`SensorReading.create` không được định nghĩa trong `telemetryService.js`. Nó là
method Mongoose được gắn lên model khi project gọi:

```js
mongoose.model('SensorReading', SensorReadingSchema, 'sensor_readings');
```

### 7.6 Schema là gì và các API đến từ đâu?

```js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const SensorReadingSchema = new Schema({ ... });
const SensorReading = mongoose.model(...);
```

| API | Nguồn | Chức năng |
|---|---|---|
| `new Schema(definition, options)` | `[MONGOOSE]` | Tạo schema object, chưa tạo document |
| `mongoose.model(name, schema, collection)` | `[MONGOOSE]` | Tạo model class nối schema với collection |
| Field option `required` | `[MONGOOSE]` | Reject document thiếu field |
| `min`, `max`, `enum` | `[MONGOOSE]` | Validator schema |
| Custom `validate.validator` | `[PROJECT callback dùng MONGOOSE]` | Rule bổ sung như integer |
| `default` | `[MONGOOSE]` | Giá trị khi field vắng |
| `autoCreate: false` | `[MONGOOSE option]` | Không tự tạo collection thường |

Schema không tự biến collection thành MongoDB Time Series. Vì vậy cần service tiếp
theo.

### 7.7 `ensureSensorReadingsTimeSeries()` và MongoDB native API

```js
function findCollectionInfo(db) {
  return db.listCollections({ name: 'sensor_readings' }, { nameOnly: false }).next();
}

const info = await findCollectionInfo(db);
```

| API | Nguồn | Chức năng |
|---|---|---|
| `db.listCollections()` | `[MONGODB native driver]` | Trả cursor metadata collection |
| `.next()` | `[MONGODB cursor]` | Lấy metadata đầu tiên hoặc null |
| `db.createCollection()` | `[MONGODB native driver]` | Tạo collection với Time Series/TTL options |
| `Object.entries()` | `[JS]` | Đổi object option thành array `[key,value]` để loop |
| `for...of` | `[JS syntax]` | Lặp từng entry |
| `value.toNumber()` | `[BSON numeric object]` | Convert kiểu số BSON wrapper nếu driver trả về |
| `Number(value)` | `[JS]` | Convert fallback thành number |

Options project truyền vào:

```js
{
  timeseries: {
    timeField: 'timestamp',
    metaField: 'deviceId',
    granularity: 'seconds'
  },
  expireAfterSeconds: 2592000
}
```

`expireAfterSeconds` do MongoDB TTL monitor thực thi nền; JavaScript không tự đặt
timer xóa từng document.

### 7.8 Historical route: query chain và aggregation

Express cung cấp `req.query`, nhưng các giá trị query đều bắt đầu là string.

```js
const parsedLimit = Number(limit);
```

`Number()` là `[JS]`, dùng convert `'100'` thành `100`. Sau đó
`Number.isInteger()` xác minh. `limit` nhận 1..3600. `maxPoints` nhận 1..1000 và
bắt buộc có `from` cùng `to`.

Mongoose chain:

```js
let databaseQuery = SensorReading.find(query)
  .sort({ timestamp: -1 })
  .limit(parsedLimit);
```

| Method | Nguồn | Chức năng |
|---|---|---|
| `.find(query)` | `[MONGOOSE]` | Tạo query lọc document |
| `.sort({timestamp:-1})` | `[MONGOOSE]` | Mới nhất trước |
| `.limit(N)` | `[MONGOOSE]` | Chỉ lấy N document |
| `.select(projection)` | `[MONGOOSE]` | Chỉ trả field cần thiết |
| `await databaseQuery` | `[MONGOOSE thenable + JS await]` | Execute query |
| `readings.reverse()` | `[JS Array]` | Đảo array tại chỗ thành cũ -> mới cho chart |

`reverse()` là JavaScript built-in, không gửi query thứ hai lên MongoDB.

Khi có `maxPoints`, route không dùng chain trên mà gọi:

```js
readings = await SensorReading.aggregate(pipeline);
```

`aggregate()` là API Mongoose chuyển pipeline sang MongoDB. Các stage/operator chính:

| Tên | Nguồn | Chức năng |
|---|---|---|
| `$match` | `[MONGODB]` | Lọc device và khoảng thời gian trước khi nhóm |
| `$sort` | `[MONGODB]` | Sắp timestamp tăng dần để `$last` chọn mẫu mới nhất trong bucket |
| `$toLong` | `[MONGODB]` | Đổi BSON Date thành millisecond |
| `$subtract`, `$divide`, `$floor` | `[MONGODB]` | Tính bucket index tương đối từ `fromDate` |
| `$group` + `$last` | `[MONGODB]` | Giữ một document đại diện cho mỗi bucket |
| `$replaceRoot` | `[MONGODB]` | Đưa document đại diện trở lại root |
| `$project` | `[MONGODB]` | Chỉ trả sensor đã qua allowlist khi client yêu cầu |

`bucketMs = ceil((to - from + 1) / maxPoints)`: `+1` tính hai endpoint và bucket
neo tại `fromDate`, vì vậy một range lệch biên Unix epoch cũng không thể trả
`maxPoints + 1` nhóm.

### 7.9 Startup order

Trong `server.js`:

| Lời gọi | Nguồn | Vì sao đứng ở vị trí đó? |
|---|---|---|
| `mongoose.connect()` | `[MONGOOSE]` | Mở MongoDB connection trước |
| `ensureSensorReadingsTimeSeries()` | `[PROJECT NC-03]` | Verify collection trước producer |
| `initializeEmailService()` | `[PROJECT NC-05]` | Chuẩn bị mail adapter |
| `setControlPublisher()` | `[PROJECT NC-01]` | Inject CB-03 publisher cho actions |
| `initializeMqttService()` | `[PROJECT MQTT]` | Cuối cùng mới subscribe telemetry |
| `app.listen()` | `[EXPRESS/Node HTTP]` | Mở HTTP port |

### 7.10 Call chain NC-03 hoàn chỉnh

```text
[MQTT.JS event] message
  -> [PROJECT] handleMqttMessage
     -> [PROJECT + JS RegExp] parseTopic
     -> [PROJECT + JSON.parse] parseJsonMessage
     -> [PROJECT] ingestTelemetry
        -> [PROJECT helpers + JS built-ins] validateTelemetryPayload
        -> [MONGOOSE] SensorReading.create
        -> [PROJECT NC-01] processTelemetryForAnomalies
```

---

## 8. NC-01 từ số 0: Z-score và anomaly engine

### 8.1 Bản đồ hàm trong `anomalyEngine.js`

| Nhóm | Hàm | Vai trò |
|---|---|---|
| Runtime policy | `setSystemArmed()`, `isSystemArmed()` | Bật/tắt remote/anomaly policy |
| Threshold | `getThresholds()`, `loadUserThresholds()`, `updateThresholds()` | Đọc/validate/lưu giới hạn |
| Baseline | `bufferKey()`, `getRollingBuffer()` | Chọn rolling window đúng series |
| Statistics | `meanAndStdDev()`, `evaluateZScore()` | Tính Z-score temp/humidity |
| Rule | `buildGasCandidate()`, `buildTemperatureCandidate()`, `buildMotionCandidate()`, `buildHumidityCandidate()` | Tạo candidate hoặc null |
| Dedupe/persist | `dedupeKey()`, `createAnomalyIfNew()` | Chặn lặp và ghi AnomalyLog |
| Actions | `executeActions()` | Gọi CB-03 fan và NC-05 email |
| Orchestrator | `processTelemetryForAnomalies()` | Chạy toàn bộ pipeline cho telemetry |
| Edge path | `processEdgeAlert()` | Ghi edge safety event không qua Z-score |

Tất cả hàm trên là `[PROJECT]`. Bên trong chúng dùng built-ins và Mongoose.

### 8.2 `Map` dùng làm gì?

```js
const rollingBuffers = new Map();
const anomalyDedupMap = new Map();
```

`Map` là `[JS]`, lưu key/value giống dictionary.

| Method | Chức năng trong project |
|---|---|
| `.has(key)` | Kiểm tra series đã có buffer chưa |
| `.get(key)` | Lấy buffer hoặc lần anomaly gần nhất |
| `.set(key, value)` | Lưu buffer/timestamp mới |
| `.delete(key)` | Xóa dedupe reservation khi xử lý lỗi |
| `.clear()` | Reset state giữa các test |

Key `deviceId:sensorType` làm `room-a:temperature` khác `room-b:temperature`.

### 8.3 `Object.freeze()` và `Object.hasOwn()`

```js
const DEFAULT_THRESHOLDS = Object.freeze({ ... });
```

- `Object.freeze()` là `[JS]`.
- Ngăn code vô tình sửa object default.
- Runtime dùng `{ ...DEFAULT_THRESHOLDS }` để tạo copy có thể thay đổi.

```js
Object.hasOwn(MIN_DELTA, sensorType)
```

- `Object.hasOwn()` là `[JS]`.
- True nếu chính object có key đó.
- `MIN_DELTA` chỉ có `temperature` và `humidity`, nên nó đồng thời là allowlist
  Z-score.

### 8.4 `meanAndStdDev()` và built-ins bên trong

```js
const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
```

| Thành phần | Nguồn | Giải thích |
|---|---|---|
| `values` | `[PROJECT input Array]` | 30 số baseline |
| `.reduce(callback, 0)` | `[JS Array]` | Gộp array thành một tổng bắt đầu từ 0 |
| `(sum, value) => ...` | `[JS arrow callback]` | Hàm cộng cho từng phần tử |
| `.length` | `[JS Array property]` | Số phần tử N |

Variance:

```js
(value - mean) ** 2
```

`**` là toán tử lũy thừa JavaScript. Chia cho `values.length` nghĩa là population
variance.

```js
Math.sqrt(variance)
```

- `Math.sqrt()` là `[JS Math]`.
- Trả căn bậc hai, biến variance thành standard deviation.

### 8.5 `evaluateZScore()` gọi những gì?

| Lời gọi/cú pháp | Nguồn | Chức năng |
|---|---|---|
| `Object.hasOwn()` | `[JS]` | Chỉ cho temp/humidity |
| `Number.isFinite()` | `[JS]` | Loại NaN/Infinity/sai kiểu |
| `getRollingBuffer()` | `[PROJECT]` | Lấy array baseline đúng series |
| `meanAndStdDev()` | `[PROJECT]` | Tính mean và stdDev |
| `Math.abs()` | `[JS Math]` | Lấy trị tuyệt đối Z và delta |
| `buffer.push(value)` | `[JS Array]` | Thêm mẫu vào cuối |
| `buffer.shift()` | `[JS Array]` | Xóa mẫu đầu/cũ nhất |

Luồng đã được làm phẳng bằng early return:

```js
if (buffer.length < WINDOW_SIZE) {
  buffer.push(value);
  return { ready: false, zScore: null, mean: null, stdDev: null, isAnomaly: false };
}
```

Chưa đủ 30 mẫu thì hàm kết thúc ngay. Khi đã đủ, code tính thống kê, gọi
`buffer.shift()` để bỏ mẫu cũ nhất rồi `buffer.push(value)` để thêm mẫu vừa chấm.

`Math.abs(zScore) > limit` phát hiện cả spike dương và âm. Điều kiện thứ hai
`Math.abs(value - mean) > MIN_DELTA[...]` loại dao động toán học quá nhỏ.

#### Vì sao `stdDev === 0` trả Z=0?

JavaScript chia số khác 0 cho 0 tạo `Infinity`, không phải exception. Nếu để
Infinity đi tiếp, một thay đổi nhỏ sau baseline phẳng có thể thành anomaly vô hạn.
Project chọn Z=0 và dựa vào hard bound trong trường hợp này.

### 8.6 Candidate là gì?

Candidate là object project tự dựng, chưa chắc đã thành document MongoDB:

```js
{
  deviceId,
  timestamp,
  sensorType: 'temperature',
  triggerType: 'Z_SCORE_EXCEEDED',
  observedValue: 35,
  calculatedZScore: 4.2,
  thresholdLimit: 3,
  severity: 'HIGH',
  autoFan: true
}
```

Builder trả:

- Object candidate nếu vi phạm.
- `null` nếu bình thường/không áp dụng.

### 8.7 Các API trong rule builders

```js
function buildGasCandidate({ deviceId, timestamp, metrics })
```

`{ deviceId, timestamp, metrics }` trong parameter là object destructuring, cú pháp
`[JS]`. Nó lấy ba field từ context object.

Temperature Z-score:

```js
Number(statistics.zScore.toFixed(3))
```

| API | Nguồn | Chức năng |
|---|---|---|
| `.toFixed(3)` | `[JS Number]` | Format thành string với 3 chữ số thập phân |
| `Number(...)` | `[JS]` | Convert string đó trở lại number để lưu DB |

Object spread:

```js
{
  ...hardThresholdCandidate(...),
  autoFan: aboveMaximum
}
```

`hardThresholdCandidate()` là `[PROJECT]`. Spread copy fields từ object nó trả về,
sau đó thêm field `autoFan`.

### 8.8 `processTelemetryForAnomalies()` và array APIs

```js
const candidates = [
  buildGasCandidate(context),
  buildTemperatureCandidate(context, temperatureStats),
  buildMotionCandidate(context),
  buildHumidityCandidate(context, humidityStats)
].filter(Boolean);
```

| API | Nguồn | Chức năng |
|---|---|---|
| Array literal `[...]` | `[JS]` | Tập bốn kết quả builder |
| `.filter(callback)` | `[JS Array]` | Giữ phần tử callback trả truthy |
| `Boolean` | `[JS function]` | Convert candidate object -> true, null -> false |

Vì vậy `.filter(Boolean)` là cách ngắn để bỏ các `null`.

```js
const created = await Promise.all(candidates.map(createAnomalyIfNew));
```

| API | Nguồn | Chức năng |
|---|---|---|
| `.map(createAnomalyIfNew)` | `[JS Array]` | Gọi hàm cho mỗi candidate, tạo array Promise |
| `Promise.all(array)` | `[JS Promise]` | Chờ tất cả Promise; reject nếu một cái reject |
| `await` | `[JS]` | Lấy array kết quả đã resolve |

Các anomaly có thể hoàn tất action khác thứ tự candidate ban đầu; code không được
dựa vào completion order.

### 8.9 System Armed dùng hàm gì?

```js
function setSystemArmed(state) {
  if (typeof state !== 'boolean') throw new TypeError(...);
  systemArmedState = state;
}
```

- `setSystemArmed` là `[PROJECT]`.
- `typeof` và `TypeError` là `[JS]`.
- `systemArmedState` là variable trong module Node.js, không lưu MongoDB.

Trong process telemetry:

```js
const temperatureStats = evaluateZScore(...);
const humidityStats = evaluateZScore(...);
if (!systemArmedState) return [];
```

Hai hàm Z-score chạy trước return, nên buffer vẫn cập nhật khi DISARMED.

### 8.10 Dedupe dùng API nào?

```js
const now = Date.now();
const lastCreatedAt = anomalyDedupMap.get(key);
```

| API | Nguồn | Chức năng |
|---|---|---|
| `Date.now()` | `[JS Date]` | Số milliseconds từ Unix epoch |
| `Map.get()` | `[JS Map]` | Lấy timestamp lần reserve/create trước |
| `Map.set()` | `[JS Map]` | Reserve key trước async work |
| `Map.delete()` | `[JS Map]` | Rollback reservation nếu lỗi |

`DEDUPE_WINDOW_MS` mặc định 60,000 ms. Nó khác email throttle 900,000 ms.

### 8.11 `createAnomalyIfNew()` và Mongoose

| Lời gọi | Nguồn | Chức năng |
|---|---|---|
| `AnomalyLog.create()` | `[MONGOOSE via PROJECT model]` | Insert anomaly document |
| `new Date()` | `[JS Date]` | Fallback timestamp hiện tại |
| `candidate.zScore ?? null` | `[JS nullish operator]` | Giữ 0; chỉ fallback null/undefined |
| `executeActions()` | `[PROJECT]` | Chạy fan/email sau persist |
| `AnomalyLog.findByIdAndUpdate()` | `[MONGOOSE]` | Update actionsTaken của document |

Toán tử `??` quan trọng hơn `||` ở Z-score: Z-score bằng `0` là giá trị hợp lệ và
không được đổi thành null.

### 8.12 `executeActions()` nối sang thư viện nào?

```js
const result = await controlPublisher(candidate.deviceId, 'fan', true);
```

- `controlPublisher` là `[PROJECT injected function]`.
- Sau `setControlPublisher(publishControlCommand)`, nó gọi CB-03.
- Bên trong CB-03 cuối cùng dùng `[MQTT.JS] client.publish()`.

```js
const emailResult = await sendAlertEmail(candidate);
```

- `sendAlertEmail` là `[PROJECT NC-05]` import từ `emailService.js`.
- Bên trong cuối cùng dùng `[NODEMAILER] transporter.sendMail()`.

`actionsTaken.push()` là `[JS Array]`, chỉ ghi audit string. Nó không thực hiện action.

### 8.13 Threshold user profile

`loadUserThresholds()` và `syncUserThresholds()` dùng:

| API | Nguồn | Chức năng |
|---|---|---|
| `User.findById()` | `[MONGOOSE]` | Lấy profile đúng user |
| `User.findOne({})` | `[MONGOOSE]` | Fallback profile đầu tiên |
| `.toObject()` | `[MONGOOSE document]` | Convert subdocument thành plain object |
| `User.findByIdAndUpdate()` | `[MONGOOSE]` | Persist thresholds |

`updateThresholds()` là `[PROJECT]`: nó tạo candidate copy, validate toàn bộ min/max,
rồi mới thay `systemThresholds`. Việc validate trước replace tránh runtime giữ một
nửa cấu hình mới và một nửa cũ.

### 8.14 Call chain NC-01 hoàn chỉnh

```text
[PROJECT NC-03] ingestTelemetry
  -> [PROJECT] processTelemetryForAnomalies
     -> evaluateZScore temp/humidity
        -> [JS Array.reduce + Math]
     -> four candidate builders
     -> [JS Array.filter/map + Promise.all]
     -> createAnomalyIfNew
        -> [JS Map + Date.now] dedupe
        -> [MONGOOSE] AnomalyLog.create
        -> executeActions
           -> [PROJECT CB-03 -> MQTT.JS] fan
           -> [PROJECT NC-05 -> NODEMAILER] email
        -> [MONGOOSE] findByIdAndUpdate actionsTaken
```

---

## 9. NC-05 từ số 0: profile email, Nodemailer và throttle

### 9.1 Bản đồ hàm

| File | Hàm | Nguồn | Vai trò |
|---|---|---|---|
| `Settings.jsx` | `handleSaveNotifications()` | `[PROJECT React handler]` | Lưu opt-in/opt-out |
| `userNotificationService.js` | `normalizeEmail()` | `[PROJECT]` | Chuẩn hóa và validate profile email |
| cùng file | `getAlertRecipientResolution()` | `[PROJECT]` | Đọc user đã bật email |
| `emailService.js` | `getEmailConfig()` | `[PROJECT]` | Đọc sender SMTP từ environment |
| cùng file | `getTransporter()` | `[PROJECT]` | Tạo/cache Nodemailer transporter |
| cùng file | `escapeHtml()` | `[PROJECT]` | Encode dynamic HTML values |
| cùng file | `formatVietnamTimestamp()` | `[PROJECT]` | Format display UTC+7 |
| cùng file | `buildAlertMessage()` | `[PROJECT]` | Tạo subject/text/html |
| cùng file | `sendAlertEmail()` | `[PROJECT]` | Severity -> recipient -> throttle -> SMTP |
| `server.js` | recipient provider callback | `[PROJECT]` | Nối DB user vào email service |

### 9.2 `process.env` là gì?

```js
env.SMTP_HOST
env.SMTP_USER
env.SMTP_PASS
```

- `process` là global object của Node.js.
- `process.env` chứa environment variables, giá trị thường là string hoặc undefined.
- `SMTP_USER` là account đăng nhập/gửi mail.
- Recipient chính là `User.email` trong MongoDB, không phải `SMTP_USER`.
- `.env` được dotenv nạp vào `process.env` khi server start.

### 9.3 `parseBoolean()` dùng built-in nào?

```js
function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
}
```

| API/cú pháp | Nguồn | Chức năng |
|---|---|---|
| Default parameter `= false` | `[JS syntax]` | Dùng false khi caller không truyền argument thứ hai |
| `String(value)` | `[JS]` | Convert value thành string |
| `.toLowerCase()` | `[JS String]` | Đổi chữ thường để nhận TRUE/True/true |
| `=== 'true'` | `[JS]` | Chỉ chuỗi true mới bật |

### 9.4 `getEmailConfig()` và array API

```js
const requiredValues = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS];
const credentialsComplete = requiredValues.every(Boolean);
```

- `.every(callback)` là `[JS Array]`, true khi mọi phần tử làm callback true.
- `Boolean` là callback built-in convert giá trị sang true/false.
- Chuỗi rỗng/undefined -> false, chuỗi credential -> true.

```js
const port = Number(env.SMTP_PORT || 587);
Number.isInteger(port)
```

`Number()` convert env string. `Number.isInteger()` bảo đảm port nguyên 1..65535.

### 9.5 Nodemailer transporter

```js
const nodemailer = require('nodemailer');
```

Đây là package ngoài trong `backend/package.json`.

```js
nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass }
});
```

| API | Nguồn | Chức năng |
|---|---|---|
| `createTransport()` | `[NODEMAILER]` | Tạo SMTP transport object, chưa gửi mail |
| `transporter.verify()` | `[NODEMAILER]` | Kiểm tra kết nối/auth SMTP khi startup được bật |
| `transporter.sendMail()` | `[NODEMAILER]` | Gửi message, trả Promise/message info |

`getTransporter()` cache transport trong variable module `transporter`. Không tạo TCP
configuration object mới cho mỗi alert.

### 9.6 `normalizeEmail()` gọi gì?

```js
const normalized = value.trim().toLowerCase();
```

| API | Nguồn | Chức năng |
|---|---|---|
| `.trim()` | `[JS String]` | Bỏ whitespace đầu/cuối |
| `.toLowerCase()` | `[JS String]` | Chuẩn hóa case để dedupe |
| `EMAIL_PATTERN.test()` | `[JS RegExp]` | Kiểm tra hình dạng email cơ bản |
| `.length` | `[JS String property]` | Chặn địa chỉ dài hơn 254 ký tự |

Regex này không gửi mail và không chứng minh mailbox tồn tại. Nó chỉ reject input có
hình dạng sai rõ ràng.

### 9.7 Mongoose query lấy recipient

```js
const users = await User.find({})
  .select('email settings.emailEnabled')
  .lean();
```

| Method | Nguồn | Chức năng |
|---|---|---|
| `User.find({})` | `[MONGOOSE]` | Query mọi user |
| `.select(...)` | `[MONGOOSE]` | Chỉ lấy email và preference |
| `.lean()` | `[MONGOOSE]` | Trả plain JS objects, nhẹ hơn document |
| `await` | `[JS]` | Execute query, nhận array users |

```js
users
  .filter((user) => user.settings?.emailEnabled !== false)
  .map((user) => normalizeEmail(user.email));
```

- `.filter()` và `.map()` là `[JS Array]`.
- `?.` là optional chaining.
- `!== false` nghĩa là chỉ explicit false mới opt-out; undefined legacy vẫn nhận.

```js
[...new Set(recipients)]
```

- `new Set(array)` là `[JS]`, loại phần tử trùng.
- Spread `...` convert Set trở lại array.

### 9.8 Recipient provider là gì?

Email service không import Mongoose User trực tiếp. Nó giữ một function variable:

```js
let recipientProvider = defaultRecipientProvider;
```

Server inject callback:

```js
setEmailRecipientProvider(async (config) => {
  const resolution = await getAlertRecipientResolution();
  if (resolution.hasUsers) return resolution.recipients;
  return config.recipient ? [config.recipient] : [];
});
```

| Hàm | Nguồn | Vai trò |
|---|---|---|
| `setEmailRecipientProvider()` | `[PROJECT]` | Kiểm tra provider là function rồi lưu nó |
| Callback `async (config) => ...` | `[PROJECT callback]` | Policy DB profile/fallback |
| `getAlertRecipientResolution()` | `[PROJECT]` | Query Mongoose users |

Nếu có user nhưng tất cả opt-out, `hasUsers=true` và `recipients=[]`; fallback env
không được dùng vì sẽ phá lựa chọn trên web.

### 9.9 Severity gate

```js
function shouldSendAlertEmail(severity) {
  return severity === 'HIGH' || severity === 'CRITICAL';
}

const severity = String(alert.severity || '').toUpperCase();
if (!shouldSendAlertEmail(severity)) return { status: 'ignored' };
```

| API | Nguồn | Chức năng |
|---|---|---|
| `shouldSendAlertEmail()` | `[PROJECT]` | Trả true đúng cho HIGH hoặc CRITICAL |
| `String()` | `[JS]` | Normalize input thành string |
| `.toUpperCase()` | `[JS String]` | high -> HIGH |
| `||` | `[JS operator]` | Chỉ cần một trong hai phép so sánh đúng |

MEDIUM humidity vẫn có AnomalyLog nhưng dừng trước SMTP.

### 9.10 Recipient normalization trong `sendAlertEmail()`

```js
function normalizeRecipients(values) {
  if (!Array.isArray(values)) throw new TypeError('...');
  return [...new Set(
    values
    .map((value) => String(value).trim())
    .filter(Boolean)
  )];
}

const recipients = normalizeRecipients(providedRecipients);
```

Đọc từ trong ra ngoài:

1. `.map()` chạy callback cho từng recipient.
2. `String()` convert type.
3. `.trim()` bỏ whitespace.
4. `.filter(Boolean)` bỏ chuỗi rỗng.
5. `new Set()` loại trùng.
6. `[...Set]` đổi lại thành array.

### 9.11 Throttle dùng `Map` và clock

```js
const throttleKey = `${alert.deviceId}:${alert.sensorType}`;
const now = nowProvider();
const lastSent = emailThrottleMap.get(throttleKey);
```

- Template literal là `[JS]`.
- `nowProvider` là `[PROJECT function variable]`, mặc định gọi `Date.now()`.
- Test có thể inject fake clock để không phải đợi thật 15 phút.
- `Map.get()` và `.set()` là `[JS Map]`.

```js
now - lastSent < THROTTLE_WINDOW_MS
```

Đều là milliseconds. Window bằng `15 * 60 * 1000 = 900000`.

Chỉ gọi:

```js
emailThrottleMap.set(throttleKey, now);
```

sau `await transporter.sendMail()` thành công. Nếu SMTP throw, dòng set không chạy.

### 9.12 Escape HTML

```js
String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  ...
```

- `String()` và `.replaceAll()` là `[JS]`.
- Method chain nghĩa là output string của lần replace trước trở thành input lần sau.
- Text email dùng raw values vì text/plain không render HTML.
- HTML email dùng escaped values để device ID/value không chèn markup.

### 9.13 Format UTC+7

```js
new Intl.DateTimeFormat('en-CA', options).formatToParts(date)
```

| API | Nguồn | Chức năng |
|---|---|---|
| `Intl.DateTimeFormat` | `[JS Internationalization]` | Formatter ngày theo timezone |
| `.formatToParts()` | `[JS Intl]` | Trả array các phần year/month/day... |
| `parts.map()` | `[JS Array]` | Đổi mỗi part thành `[type,value]` |
| `Object.fromEntries()` | `[JS]` | Đổi array entry thành object |

Database timestamp vẫn là Date/UTC instant. Chỉ string trình bày mail được format
`Asia/Ho_Chi_Minh` và thêm `UTC+7`.

### 9.14 Build message dùng API nào?

```js
const eventTime = new Date(timestamp || nowProvider());
```

`new Date()` là `[JS]`. Nếu invalid, `.getTime()` trả NaN và code dùng fallback now.

```js
text: [line1, line2, ...].join('\n')
```

`.join('\n')` là `[JS Array]`, nối các dòng bằng newline.

HTML template dùng template literal. `${fields.deviceId}` là JavaScript chèn string
đã escape, không phải React JSX.

### 9.15 `sendMail()` headers

```js
function buildRecipientHeaders(recipients, senderAddress) {
  if (recipients.length === 1) return { to: recipients[0] };
  return { to: senderAddress, bcc: recipients };
}

const recipientHeaders = buildRecipientHeaders(recipients, config.user);
```

- `buildRecipientHeaders()` là `[PROJECT]` và dùng early return.
- Một recipient: đưa vào `to`.
- Nhiều recipient: subscriber nằm trong `bcc` để không thấy email nhau.

```js
await activeTransporter.sendMail({
  from: config.from,
  ...recipientHeaders,
  ...message
});
```

- `sendMail` là `[NODEMAILER]`.
- Object spread là `[JS]`.
- Promise resolve có `messageId`; reject chuyển đến `executeActions()` catch.

### 9.16 Settings React gọi gì?

Trong `Settings.jsx`:

| Lời gọi | Nguồn | Chức năng |
|---|---|---|
| `useState()` | `[REACT]` | Tạo emailEnabled/profileEmail/threshold state |
| `useEffect()` | `[REACT]` | Load profile và threshold sau mount |
| `apiFetch()` | `[PROJECT]` | Gọi protected profile/control routes |
| `.then()` | `[JS Promise]` | Đăng ký callback thành công |
| `.catch()` | `[JS Promise]` | Đăng ký callback lỗi |
| `.finally()` | `[JS Promise]` | Tắt loading ở mọi kết quả |
| `e.preventDefault()` | `[React SyntheticEvent/Browser behavior]` | Không reload form |
| `setEmailEnabled()` | `[REACT-generated]` | Đổi checkbox/toggle state |
| `saveProfileChanges()` | `[PROJECT]` | POST profile payload |
| `setTimeout()` | `[BROWSER]` | Xóa success message sau vài giây |

`.then(async (res) => ...)` và `await` là hai cách làm việc với Promise. File đang
dùng cả hai; về ý nghĩa đều chờ xử lý bất đồng bộ.

### 9.17 Các status email có nghĩa gì?

| Status | Ai trả? | Nghĩa |
|---|---|---|
| `ignored` | `sendAlertEmail` | Severity không phải HIGH/CRITICAL |
| `disabled` | `sendAlertEmail` | Email config không enabled |
| `skipped` | `sendAlertEmail` | Không có recipient |
| `throttled` | `sendAlertEmail` | Cùng device/sensor đã gửi trong 15 phút |
| `sent` | `sendAlertEmail` | Nodemailer sendMail resolve |
| `EMAIL_FAILED: ...` | `executeActions` | sendAlertEmail throw |

### 9.18 Call chain NC-05 hoàn chỉnh

```text
[PROJECT NC-01] executeActions(candidate)
  -> [PROJECT] sendAlertEmail
     -> [JS String + Set] severity gate
     -> [PROJECT] getEmailConfig
        -> [NODE process.env + JS Number/String]
     -> [PROJECT] getTransporter
        -> [NODEMAILER] createTransport
     -> [PROJECT injected provider]
        -> getAlertRecipientResolution
           -> [MONGOOSE] User.find.select.lean
           -> [JS Array filter/map + Set]
     -> [JS Map + Date.now] throttle
     -> [PROJECT + JS Intl/String] buildAlertMessage
     -> [NODEMAILER] transporter.sendMail
     -> [JS Map.set] commit throttle after success
```

---

## 10. Khi gặp một hàm lạ, phải mở file nào tiếp?

| Đang nhìn lời gọi | Loại | Bước tiếp theo |
|---|---|---|
| `apiFetch(...)` | Project import `../api` | Mở `frontend/src/api.js` |
| `setTelemetry(...)` | React-generated setter | Quay lên dòng `useState`; không tìm file khác |
| `JSON.stringify(...)` | JavaScript built-in | Hiểu input object -> output JSON string |
| `res.json()` ở frontend | Browser Response | Hiểu response body -> JS object |
| `res.json(...)` ở backend | Express Response | Hiểu JS object -> HTTP JSON |
| `parseActuatorState(...)` | Project cùng file | Nhảy tới function trong `control.js` |
| `publishControlCommand(...)` | Project import service | Mở `backend/services/mqttService.js` |
| `mqttClient.publish(...)` | MQTT.js library | Không có source project; xem options/callback quanh lời gọi |
| `ingestTelemetry(...)` | Project service | Mở `backend/services/telemetryService.js` |
| `SensorReading.create(...)` | Mongoose model method | Mở schema để hiểu document; method do Mongoose cung cấp |
| `processTelemetryForAnomalies(...)` | Project service | Mở `anomalyEngine.js` |
| `Math.abs(...)` | JavaScript built-in | Hiểu trị tuyệt đối; không tìm project file |
| `sendAlertEmail(...)` | Project service | Mở `emailService.js` |
| `activeTransporter.sendMail(...)` | Nodemailer | Hiểu message/Promise; không phải project function |
| `deserializeJson(...)` | ArduinoJson | Hiểu parse buffer; không tìm định nghĩa trong project |
| `actuators.setFan(...)` | Project class method | Mở `actuators.cpp` |
| `digitalWrite(...)` | Arduino framework | Điểm cuối ghi GPIO |

### 10.1 Quy tắc tìm bằng IDE hoặc `rg`

Nếu nghi là project function:

```powershell
rg -n "functionName" frontend/src backend firmware/src
```

Ví dụ:

```powershell
rg -n "publishControlCommand" backend
```

Kết quả thường có:

1. Dòng định nghĩa hàm.
2. Dòng export.
3. Dòng import/require.
4. Các nơi gọi.

Nếu chỉ thấy nơi gọi mà không thấy định nghĩa, kiểm tra nó có phải setter React,
built-in, method trên object thư viện hoặc macro framework không.

---

## 11. Từ điển nhanh các hàm/API quan trọng

| Tên | Nguồn | Mục | Một câu mô tả |
|---|---|---|---|
| `useState` | React | UI | Tạo state và setter |
| `useEffect` | React | UI | Chạy side effect sau render |
| `useRef` | React | UI | Giữ mutable value qua render |
| `fetch` | Browser | UI/API | Gửi HTTP request |
| `Headers` | Browser | UI/API | Quản lý HTTP headers |
| `localStorage.getItem` | Browser | Auth connector | Đọc JWT local |
| `Response.json` | Browser | UI/API | Parse body JSON |
| `JSON.stringify` | JavaScript | HTTP/MQTT | Object -> JSON string |
| `JSON.parse` | JavaScript | MQTT backend | JSON string -> object |
| `Promise.all` | JavaScript | NC-01 | Chờ nhiều async candidate |
| `Array.map` | JavaScript | NC-01/05 | Biến đổi từng phần tử |
| `Array.filter` | JavaScript | NC-01/05 | Giữ phần tử thỏa điều kiện |
| `Array.reduce` | JavaScript | NC-01 | Gộp baseline thành tổng/variance |
| `Array.push/shift` | JavaScript | NC-01 | Roll window |
| `Map.get/set/delete` | JavaScript | NC-01/05 | Baseline/dedupe/throttle state |
| `Set.has` | JavaScript | CB-03/05 | Allowlist membership |
| `Math.abs/sqrt` | JavaScript | NC-01 | Z-score math |
| `Number.isFinite` | JavaScript | NC-01/03 | Validate number hữu hạn |
| `Number.isInteger` | JavaScript | NC-03/05 | Validate integer |
| `Date.now/new Date` | JavaScript | NC-01/03/05 | Epoch time/Date object |
| `Intl.DateTimeFormat` | JavaScript | NC-05 | Format UTC+7 display |
| `router.post/get` | Express | API | Đăng ký route handler |
| `res.status/json` | Express | API | Gửi HTTP response |
| `SensorReading.create` | Mongoose | NC-03 | Insert telemetry |
| `AnomalyLog.create` | Mongoose | NC-01 | Insert anomaly |
| `find/sort/limit/select` | Mongoose | NC-03 | Build historical query |
| `lean` | Mongoose | NC-05 | Query plain objects |
| `db.createCollection` | MongoDB driver | NC-03 | Tạo Time Series collection |
| `mqttClient.publish` | MQTT.js | CB-03 | Publish fan command |
| `nodemailer.createTransport` | Nodemailer | NC-05 | Tạo SMTP transport |
| `transporter.sendMail` | Nodemailer | NC-05 | Gửi mail |
| `deserializeJson` | ArduinoJson | CB-03 | Parse MQTT payload |
| `JsonVariant.is/as` | ArduinoJson | CB-03 | Kiểm tra/đọc kiểu JSON |
| `strcmp` | C/C++ | CB-03 | So sánh actuator string |
| `portENTER/EXIT_CRITICAL` | FreeRTOS | CB-03 | Bảo vệ shared state |
| `digitalWrite` | Arduino | CB-03 | Ghi mức điện GPIO |

---

## 12. Mẫu trả lời khi thầy chỉ vào một hàm bất kỳ

Trả lời theo 5 bước:

```text
1. Nguồn của hàm
2. Input
3. Output hoặc side effect
4. Vai trò trong mục CB/NC
5. Lỗi/giới hạn quan trọng
```

### Ví dụ `JSON.stringify()`

> Đây là JavaScript built-in, không phải hàm em tự viết. Nó nhận object command và
> trả JSON string để dùng làm HTTP/MQTT payload. Nếu object có giá trị không
> serialize được như function thì field đó không xuất hiện; payload dự án chỉ gồm
> deviceId, actuator và boolean/string state nên phù hợp.

### Ví dụ `setTelemetry()`

> Đây là setter React sinh ra từ `useState`, nên không có định nghĩa ở file khác.
> Nó nhận object mới hoặc callback nhận state cũ, cập nhật state và làm React render
> lại. Trong CB-03 em dùng callback để optimistic-update riêng `fanOn` mà vẫn giữ
> metrics và actuator state khác.

### Ví dụ `SensorReading.create()`

> `SensorReading` là model project tạo từ Mongoose schema, còn `.create()` là API
> của Mongoose. Nó validate object rồi insert vào `sensor_readings`. Em await thành
> công trước khi gọi NC-01, nên anomaly luôn dựa trên telemetry đã persist.

### Ví dụ `mqttClient.publish()`

> Đây là API MQTT.js. Nó nhận topic, payload, QoS/retain options và callback. Dự án
> dùng QoS 1, retain false. Callback thành công chỉ xác nhận publish ở tầng MQTT,
> không xác nhận motor fan quay.

### Ví dụ `sendMail()`

> Đây là method Nodemailer trên transporter. Nó nhận from/to/bcc/subject/text/html
> và trả Promise. Project chỉ ghi throttle sau Promise resolve để SMTP lỗi còn retry.

### Ví dụ `digitalWrite()`

> Đây là Arduino framework API, điểm cuối ghi HIGH/LOW ra GPIO. Project không gọi
> trực tiếp từ MQTT layer mà đi qua `Actuators::setFan()` để giữ lock và map relay
> active-low đúng cách.

---

## 13. Thứ tự học dành cho người bắt đầu từ số 0

### Buổi 1: nền tảng

1. Đọc mục 1-5 của tài liệu này.
2. Tự phân biệt function, method, callback, Promise và React setter.
3. Không chuyển sang backend nếu còn nhầm `res.json` frontend/backend.

### Buổi 2: CB-03

1. Đọc mục 6.
2. Mở từng file theo call chain.
3. Tự nói nguồn của `useState`, `apiFetch`, `fetch`, `router.post`,
   `mqttClient.publish`, `deserializeJson`, `digitalWrite`.

### Buổi 3: NC-03

1. Đọc mục 7.
2. Phân biệt project validation, Mongoose model và MongoDB collection API.
3. Tự vẽ `MQTT -> validate -> create -> anomaly`.

### Buổi 4: NC-01

1. Đọc mục 8.
2. Tự tính một ví dụ mean/stdDev/Z-score nhỏ trên giấy.
3. Giải thích `Map`, `reduce`, `filter`, `map`, `Promise.all`.
4. Chỉ đúng nơi persist trước action.

### Buổi 5: NC-05

1. Đọc mục 9.
2. Phân biệt SMTP sender và profile recipient.
3. Giải thích Mongoose `.find().select().lean()`.
4. Giải thích vì sao throttle set sau `sendMail`.

### Buổi 6: nối cả bốn mục

Đọc thành tiếng:

```text
ESP32 publish telemetry bằng MQTT.
Backend MQTT.js nhận Buffer và parse topic/JSON.
NC-03 validate rồi Mongoose create SensorReading.
NC-01 dùng JavaScript Map/Array/Math để tính rule/Z-score.
Mongoose create AnomalyLog trước.
executeActions gọi CB-03 qua MQTT.js và NC-05 qua Nodemailer.
Frontend React polling lấy state/document mới để hiển thị.
```

---

## 14. Quan hệ với các tài liệu còn lại

Đọc theo thứ tự:

1. `THAI_KIET_CODE_OWNERSHIP_REPORT.md`: biết phần nào là phạm vi Kiệt.
2. **Tài liệu hiện tại:** học cú pháp, nguồn hàm và call chain từ số 0.
3. `THAI_KIET_CODE_WALKTHROUGH.md` mục 8: đối chiếu từng statement code thật.
4. `THAI_KIET_VIVA.md`: luyện cách trình bày kiến trúc ngắn gọn.
5. `THAI_KIET_QA.md`: luyện câu hỏi phản biện.
6. `THAI_KIET_DEMO.md`: chứng minh bằng test và phần cứng.

Khi gặp một hàm chưa rõ, không học thuộc tên. Hãy xác định nguồn trước. Nếu là
project function, mở định nghĩa tiếp theo. Nếu là framework/library API, học contract
input/output của API và giải thích project dùng contract đó để làm gì.
