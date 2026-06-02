# Backend SmartHome - Hướng dẫn dành cho nhóm


## Yêu cầu

- Node.js 18+ 
- PostgreSQL hoặc Neon Postgres
- MQTT broker cục bộ hoặc Adafruit IO
- `npm`

##  Cài đặt nhanh

Mở terminal và chạy:

```powershell
cd "code_backend_team/Do_An_Da_Nganh"
npm install
npm run prisma:generate
```

## Cấu hình môi trường

Sao chép file mẫu:

```powershell
copy .env.example .env
```

Sau đó chỉnh các giá trị phù hợp.

### Ví dụ `.env` chạy local
## Nhớ chỉnh lại ở DATABASE_URL cái pass với tên database PostgreSQL chạy ở local của aiem nha.
```env
PORT=3001
NODE_ENV=development

REQUIRE_DB=true
REQUIRE_MQTT=false

DATABASE_URL=postgresql://postgres:password@localhost:5432/smarthome_db?schema=public

JWT_SECRET=change_me_secret_key_123
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=change_me_refresh_key_456
JWT_REFRESH_EXPIRES_IN=7d
JWT_ISSUER=smarthome-api
JWT_AUDIENCE=smarthome-client
AUTH_ALLOWED_ROLES=user,admin

MQTT_URL=mqtt://localhost:1883
MQTT_USERNAME= 
MQTT_PASSWORD=
MQTT_TOPIC_TELEMETRY=yolohome/telemetry
MQTT_TOPIC_CONTROL=yolohome/control
```

### Ví dụ `.env` dùng Adafruit IO. Tại dùng chung MQTT nên MQTT_USERNAME với MQTT_PASSWORD lấy chung của Huy.

```env
REQUIRE_MQTT=true
MQTT_URL=mqtts://io.adafruit.com:8883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_TOPIC_TELEMETRY=HuyGia/feeds/+
MQTT_TOPIC_CONTROL=HuyGia/feeds/button1,HuyGia/feeds/button2,HuyGia/feeds/button3,HuyGia/feeds/button4
MQTT_CONTROL_TOPIC_MAP={"light":"HuyGia/feeds/button1","fan":"HuyGia/feeds/button2","button3":"HuyGia/feeds/button3","button4":"HuyGia/feeds/button4"}
MQTT_CONTROL_VALUE_MAP={"turn_on":"1","turn_off":"0"}
```

Luu y: `button3` va `button4` dung chung quy uoc voi `button1` va `button2`: `turn_on` gui `1`, `turn_off` gui `0`.

### Ghi chú

- `REQUIRE_DB=true` bắt buộc server phải kết nối database khi khởi động.
- `REQUIRE_MQTT=true` bắt buộc server phải kết nối broker khi khởi động.
- Nếu aiem dùng broker local và không cần MQTT khi chạy, đặt `REQUIRE_MQTT=false`.

##  Chạy backend

### Chạy development

```powershell
npm run dev
```


### Kết quả nếu chạy juan

- Database connected (nếu `REQUIRE_DB=true`)
- MQTT connected (nếu `REQUIRE_MQTT=true`)
- Server listening port: 3001

## Kiến trúc chính

- `server.js`: khởi tạo Express, DB, MQTT, WebSocket.
- `src/app.js`: cấu hình middleware, route, error handler.
- `src/routes/api.js`: mount route `users`, `devices`, `environment`.
- `src/routes/user.routes.js`: auth và quản lý user.
- `src/routes/device.routes.js`: điều khiển thiết bị.
- `src/routes/environment.routes.js`: telemetry environment.
- `src/iot/mqttHandler.js`: xử lý MQTT, lưu DB, broadcast WS.
- `src/iot/wsHandler.js`: WebSocket realtime.
- `src/services/*`: logic linh tinh.

## Dùng Postman để test API

Base URL: `http://localhost:3001/api`

### Auth / User

#### Đăng ký

- Method: `POST`
- URL: `http://localhost:3001/api/users/register`
- Body:
  ```json
  {
    "username": "testuser",
    "displayName": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }
  ```

#### Đăng nhập

- Method: `POST`
- URL: `http://localhost:3001/api/users/login`
- Body:
  ```json
  {
    "identifier": "testuser",
    "password": "password123"
  }
  ```

#### Refresh token

- Method: `POST`
- URL: `http://localhost:3001/api/users/refresh`
- Body:
  ```json
  {
    "refreshToken": "<REFRESH_TOKEN>"
  }
  ```

#### Logout

- Method: `POST`
- URL: `http://localhost:3001/api/users/logout`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

#### Lấy thông tin user hiện tại

- Method: `GET`
- URL: `http://localhost:3001/api/users/me`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

#### Cập nhật user

- Method: `PATCH`
- URL: `http://localhost:3001/api/users/me`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

#### Đổi mật khẩu

- Method: `PATCH`
- URL: `http://localhost:3001/api/users/me/password`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

#### Admin user

- Method: `GET`
- URL: `http://localhost:3001/api/users`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

- Method: `GET`
- URL: `http://localhost:3001/api/users/:userId`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

- Method: `PATCH`
- URL: `http://localhost:3001/api/users/:userId/role`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

### Device

#### Lấy danh sách thiết bị

- Method: `GET`
- URL: `http://localhost:3001/api/devices`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

#### Điều khiển thiết bị

- Method: `POST`
- URL: `http://localhost:3001/api/devices/:id/control`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`
- Body:
  ```json
  {
    "action": "turn_on",
    "payload": { "source": "frontend" }
  }
  ```

#### Lấy lịch sử điều khiển thiết bị

- Method: `GET`
- URL: `http://localhost:3001/api/devices/:id/history?limit=100&from=...&to=...`
  VD:`http://localhost:3001/api/devices/light/history?limit=50`
  Muốn tìm :id thì mở Neon database lấy, hoặc dùng API GET devices để xem danh sách :id cũng được
- Header: `Authorization: Bearer <ACCESS_TOKEN>`
- Query params:
  - `limit`: số lượng record (default 100, max 500)
  - `from`: từ ngày (ISO string, optional)
  - `to`: đến ngày (ISO string, optional)
- Response:
  ```json
  {
    "deviceId": "light_01",
    "count": 5,
    "data": [
      {
        "c_id": 1,
        "device_id": "light_01",
        "u_id": "user-uuid",
        "event": {
          "deviceId": "light_01",
          "action": "turn_on",
          "publishedValue": "1",
          "actor": {
            "sub": "user-uuid",
            "email": "user@example.com"
          },
          "ts": "2026-05-15T12:30:00Z"
        },
        "time": "2026-05-15T12:30:00Z",
        "devices": {
          "device_id": "light_01",
          "d_name": "Đèn phòng khách",
          "type": "light"
        },
        "users": {
          "u_id": "user-uuid",
          "username": "john",
          "email": "john@example.com"
        }
      }
    ]
  }
  ```

### Environment

#### Dữ liệu mới nhất

- Method: `GET`
- URL: `http://localhost:3001/api/environment/latest`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

#### Snapshot

- Method: `GET`
- URL: `http://localhost:3001/api/environment/snapshot`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

#### Lịch sử

- Method: `GET`
- URL: `http://localhost:3001/api/environment/history`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`
- Query: `limit`, `from`, `to`, `roomId`

#### Dữ liệu theo phòng

- Method: `GET`
- URL: `http://localhost:3001/api/environment/rooms`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

### Alert & Threshold (Cảnh báo)

#### Lấy danh sách threshold (Cấu hình ngưỡng cảnh báo)

- Method: `GET`
- URL: `http://localhost:3001/api/environment/settings/thresholds`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`
- Response:
  ```json
  {
    "data": [
      {
        "configKey": "temperature_threshold",
        "min": 16,
        "max": 32,
        "enabled": true,
        "unit": "°C"
      }
    ]
  }
  ```

#### Lấy một threshold

- Method: `GET`
- URL: `http://localhost:3001/api/environment/settings/thresholds/temperature_threshold`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

#### Set hoặc update threshold

- Method: `POST`
- URL: `http://localhost:3001/api/environment/settings/thresholds`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`
- Body:
  ```json
  {
    "configKey": "temperature_threshold",
    "min": 16,
    "max": 32,
    "enabled": true,
    "unit": "°C"
  }
  ```
- **Các threshold khác:**
  - `humidity_threshold`: min=30, max=80 (%)
  - `gas_threshold`: max=50 (ppm)
  - `light_threshold`: min=0, max=100 (%)

#### Lấy alerts gần đây

- Method: `GET`
- URL: `http://localhost:3001/api/environment/alerts?limit=50&hours=24&roomId=...`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`
- Query params:
  - `limit`: số lượng alert (default 50, max 200)
  - `hours`: lấy alert trong vòng N giờ (default 24)
  - `roomId`: lọc theo phòng (optional)
- Response:
  ```json
  {
    "data": [
      {
        "a_id": "uuid-xxx",
        "a_type": "temperature_alert",
        "r_id": "room-uuid",
        "metadata": {
          "reason": "temperature too high (35 > 32)",
          "value": 35,
          "readingKind": "environment",
          "timestamp": "2026-05-15T10:30:00Z"
        },
        "time": "2026-05-15T10:30:00Z",
        "rooms": {
          "r_id": "room-uuid",
          "name": "Phòng Khách",
          "room_type": "living_room"
        }
      }
    ],
    "count": 1
  }
  ```

#### Xoá alert

- Method: `DELETE`
- URL: `http://localhost:3001/api/environment/alerts/uuid-xxx`
- Header: `Authorization: Bearer <ACCESS_TOKEN>`

#### Setup mặc định các threshold (Chạy lần đầu)

```powershell
node scripts/init-thresholds.js
```

Điều này sẽ set up:
- Temperature: 16°C - 32°C
- Humidity: 30% - 80%
- Gas: max 50 ppm
- Light: 0% - 100%


## lƯU í:

- Copy `.env.example` thành `.env` rồi chỉnh như trên kia
- Nếu muốn chạy local và không có MQTT, đặt `REQUIRE_MQTT=false`
- Dùng cùng broker MQTT, nế chia sẻ cấu hình broker của Huy
- API auth dùng route `/api/users/login` và `/api/users/register`

### CHẠY BACKEND:
cd .\code_backend_team\Do_An_Da_Nganh\
npm install                             
npm run dev                                                                                   

### CHẠY FRONTEND:
cd .\ui\ui\  
npm install
npm run dev

### PUSH prisma vào postgresql (nếu chưa làm)
npx prisma db push

### ĐỂ xem danh sách (vd như user, alert, devices)
npx prisma studio
