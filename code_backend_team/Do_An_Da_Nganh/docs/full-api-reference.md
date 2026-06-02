# Toàn bộ API Backend SmartHome

## Tổng quan

Backend SmartHome cung cấp REST API để:
- Quản lý authentication (đăng ký, đăng nhập, token)
- Điều khiển thiết bị (đèn, quạt qua MQTT)
- Lấy dữ liệu sensor từ Adafruit IO
- WebSocket realtime cho frontend

**Base URL:** `http://localhost:3001/api`

---

## 1. Authentication APIs

### **Đăng ký tài khoản**
```http
POST /api/users/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123",
  "displayName": "Test User"
}
```

**Response:**
```json
{
  "user": {
    "u_id": "uuid",
    "username": "testuser",
    "email": "test@example.com",
    "role": "user"
  }
}
```

### **Đăng nhập**
```http
POST /api/users/login
Content-Type: application/json

{
  "identifier": "testuser",
  "password": "password123"
}
```

**Response:**
```json
{
  "user": {
    "u_id": "uuid",
    "username": "testuser",
    "email": "test@example.com",
    "role": "user"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### **Refresh token**
```http
POST /api/users/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "user": {
    "u_id": "uuid",
    "username": "testuser",
    "email": "test@example.com",
    "role": "user"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### **Đăng xuất**
```http
POST /api/users/logout
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

### **Lấy thông tin user hiện tại**
```http
GET /api/users/me
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "user": {
    "u_id": "uuid",
    "username": "testuser",
    "email": "test@example.com",
    "role": "user"
  }
}
```

### **Cập nhật thông tin user**
```http
PATCH /api/users/me
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "displayName": "New Name"
}
```

**Response:**
```json
{
  "user": {
    "u_id": "uuid",
    "username": "testuser",
    "email": "test@example.com",
    "displayName": "New Name",
    "role": "user"
  }
}
```

### **Đổi mật khẩu**
```http
PATCH /api/users/me/password
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

**Response:**
```json
{
  "message": "Password updated successfully"
}
```

### **Admin: Lấy danh sách users**
```http
GET /api/users
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "users": [
    {
      "u_id": "uuid",
      "username": "testuser",
      "email": "test@example.com",
      "role": "user"
    }
  ]
}
```

### **Admin: Lấy thông tin user cụ thể**
```http
GET /api/users/:userId
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "user": {
    "u_id": "uuid",
    "username": "testuser",
    "email": "test@example.com",
    "role": "user"
  }
}
```

### **Admin: Cập nhật role user**
```http
PATCH /api/users/:userId/role
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "role": "admin"
}
```

**Response:**
```json
{
  "user": {
    "u_id": "uuid",
    "username": "testuser",
    "email": "test@example.com",
    "role": "admin"
  }
}
```

---

## 2. Device Control APIs

### **Lấy danh sách thiết bị**
```http
GET /api/devices
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "devices": [
    {
      "device_id": "light",
      "type": "light",
      "d_name": "Living Room Light"
    },
    {
      "device_id": "fan",
      "type": "fan",
      "d_name": "Ceiling Fan"
    }
  ]
}
```

### **Cập nhật thiết bị**
```http
PUT /api/devices/:id
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Response:**
```json
{
  "device": {
    "device_id": "light",
    "type": "light",
    "d_name": "Living Room Light"
  }
}
```

### **Điều khiển thiết bị**
```http
POST /api/devices/:id/control
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "action": "turn_on"
}
```

**Valid device IDs:**
- `light` → Bật/tắt đèn (publish vào `HuyGia/feeds/button1`)
- `fan` → Bật/tắt quạt (publish vào `HuyGia/feeds/button2`)
- `button1`, `button2` → Điều khiển trực tiếp

**Valid actions:**
- `turn_on` → Gửi giá trị `1`
- `turn_off` → Gửi giá trị `0`

**Ví dụ 1: Bật đèn**
```http
POST /api/devices/light/control
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "action": "turn_on"
}
```

**Ví dụ 2: Tắt quạt**
```http
POST /api/devices/fan/control
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "action": "turn_off"
}
```

**Response:**
```json
{
  "ok": true,
  "topic": "HuyGia/feeds/button1",
  "value": "1"
}
```

### **Lấy lịch sử điều khiển của thiết bị**
```http
GET /api/devices/:id/history
Authorization: Bearer <accessToken>
```

**Query params:**
- `limit`: Số lượng bản ghi (default: 100)
- `from`: Từ ngày (ISO string, optional)
- `to`: Đến ngày (ISO string, optional)

**Response:**
```json
{
  "deviceId": "light",
  "count": 2,
  "data": []
}
```

### **Lấy toàn bộ lịch sử điều khiển**
```http
GET /api/devices/history/all
Authorization: Bearer <accessToken>
```

**Query params:**
- `limit`: Số lượng bản ghi (default: 50)
- `deviceId`: Lọc theo thiết bị (optional)
- `userId`: Lọc theo user (optional)
- `roomId`: Lọc theo phòng (optional)
- `from`: Từ ngày (ISO string, optional)
- `to`: Đến ngày (ISO string, optional)

**Response:**
```json
{
  "count": 0,
  "data": []
}
```

### **Gợi ý AI cho thiết bị**
```http
GET /api/devices/ai-suggest
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "ok": true,
  "currentEnvironment": {
    "temperature": 28.5,
    "humidity": 65.2,
    "brightness": 150,
    "gas_level": 400
  },
  "suggestions": {},
  "reasons": {}
}
```

### **Face Access Webhook**
```http
POST /api/devices/face-access
Content-Type: application/json

{
  "action": "unlock",
  "user": "john_doe"
}
```

**Response:**
```json
{
  "ok": true
}
```

### **Voice Command**
```http
POST /api/devices/voice-command
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "text": "bật đèn"
}
```

**Response:**
```json
{
  "ok": true,
  "text": "bật đèn"
}
```

---

## 3. Environment Sensor APIs

### **Lấy dữ liệu sensor mới nhất**
```http
GET /api/environment/latest
Authorization: Bearer <accessToken>
```

**Query params:**
- `roomId`: Lọc theo phòng (optional)

**Response:**
```json
{
  "data": {
    "temperature": 28.5,
    "humidity": 65.2,
    "light": 150,
    "gas": 400
  }
}
```

### **Lấy snapshot dashboard (tổng hợp 4 chỉ số)**
```http
GET /api/environment/snapshot
Authorization: Bearer <accessToken>
```

**Query params:**
- `roomId`: Lọc theo phòng (optional)
- `scanLimit`: Số lượng bản ghi scan để tìm latest (optional)

**Response:**
```json
{
  "data": {
    "temperature": {
      "value": 28.5,
      "capturedAt": "2026-05-10T10:30:00.000Z",
      "sourceReadingId": 123
    },
    "humidity": {
      "value": 65.2,
      "capturedAt": "2026-05-10T10:30:00.000Z",
      "sourceReadingId": 124
    },
    "light": {
      "value": 150,
      "capturedAt": "2026-05-10T10:29:00.000Z",
      "sourceReadingId": 125
    },
    "gas": {
      "value": 400,
      "capturedAt": "2026-05-10T10:28:00.000Z",
      "sourceReadingId": 126
    }
  }
}
```

### **Lấy lịch sử sensor**
```http
GET /api/environment/history
Authorization: Bearer <accessToken>
```

**Query params:**
- `limit`: Số lượng bản ghi (default: 50, max: 1000)
- `from`: Từ ngày (ISO string, optional)
- `to`: Đến ngày (ISO string, optional)
- `roomId`: Lọc theo phòng (optional)

**Ví dụ:**
```http
GET /api/environment/history?limit=100&from=2026-05-01T00:00:00.000Z&to=2026-05-10T23:59:59.999Z
```

**Response:**
```json
{
  "data": [
    {
      "id": 123,
      "temperature": 28.5,
      "humidity": null,
      "light": null,
      "gas": null,
      "capturedAt": "2026-05-10T10:30:00.000Z",
      "roomId": "living_room"
    },
    {
      "id": 124,
      "temperature": null,
      "humidity": 65.2,
      "light": null,
      "gas": null,
      "capturedAt": "2026-05-10T10:30:05.000Z",
      "roomId": "living_room"
    }
  ]
}
```

### **Lấy dữ liệu theo phòng**
```http
GET /api/environment/rooms/latest
Authorization: Bearer <accessToken>
```

**Query params:**
- `scanLimit`: Số lượng bản ghi scan để tìm latest (default: 100)

**Response:**
```json
{
  "data": [
    {
      "roomId": "living_room",
      "temperature": 28.5,
      "humidity": 65.2,
      "light": 150,
      "gas": 400,
      "latestAt": "2026-05-10T10:30:00.000Z"
    },
    {
      "roomId": "bedroom",
      "temperature": 27.8,
      "humidity": 62.1,
      "light": 45,
      "gas": 380,
      "latestAt": "2026-05-10T10:25:00.000Z"
    }
  ]
}
```

### **Lấy danh sách phòng**
```http
GET /api/environment/rooms
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "data": []
}
```

### **Tạo phòng**
```http
POST /api/environment/rooms
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Response:**
```json
{
  "data": {}
}
```

### **Lấy nhiều readings mới nhất**
```http
GET /api/environment
Authorization: Bearer <accessToken>
```

**Query params:**
- `limit`: Số lượng (default: 50, max: 1000)
- `roomId`: Lọc theo phòng (optional)

**Response:**
```json
{
  "data": [
    {
      "id": 123,
      "temperature": 28.5,
      "humidity": null,
      "light": null,
      "gas": null,
      "capturedAt": "2026-05-10T10:30:00.000Z",
      "roomId": "living_room"
    }
  ]
}
```

### **Danh sách alerts gần đây**
```http
GET /api/environment/alerts
Authorization: Bearer <accessToken>
```

**Query params:**
- `limit`: Số lượng bản ghi (default: 50)
- `roomId`: Lọc theo phòng (optional)
- `hours`: Số giờ gần nhất (default: 24)

**Response:**
```json
{
  "data": [],
  "count": 0
}
```

### **Xoá alert**
```http
DELETE /api/environment/alerts/:alertId
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "data": {},
  "message": "Alert deleted"
}
```

### **Threshold settings**

#### **Lấy tất cả threshold configs**
```http
GET /api/environment/settings/thresholds
Authorization: Bearer <accessToken>
```

#### **Lấy một threshold config**
```http
GET /api/environment/settings/thresholds/:configKey
Authorization: Bearer <accessToken>
```

#### **Tạo hoặc cập nhật threshold**
```http
POST /api/environment/settings/thresholds
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "configKey": "temperature_threshold",
  "min": 20,
  "max": 30,
  "enabled": true,
  "unit": "C"
}
```

**Response:**
```json
{
  "data": {},
  "message": "Threshold updated successfully"
}
```

---

## 4. Health Check API

### **Kiểm tra server**
```http
GET /health
```

**Response:**
```json
{
  "ok": true
}
```

---

## Lưu ý chung

### **Headers bắt buộc:**
- Tất cả API trừ `register`, `login`, `refresh`, `face-access`, `health` cần:
  ```
  Authorization: Bearer <accessToken>
  ```



### **Error responses:**

**Invalid token:**
```json
{
  "error": "Invalid token"
}
```

**Missing token:**
```json
{
  "error": "Missing token"
}
```

**Device not found:**
```json
{
  "error": "deviceId is required"
}
```

**No control topic:**
```json
{
  "error": "No control topic configured for this device"
}
```

**Invalid credentials:**
```json
{
  "error": "invalid credentials"
}
```

**User not found:**
```json
{
  "error": "user not found"
}
```

---

## Cách test nhanh

### **1. Chạy backend:**
```powershell
cd code_backend_team/Do_An_Da_Nganh
npm run dev
```

### **2. Đăng nhập lấy token:**
```http
POST http://localhost:3001/api/users/login
Content-Type: application/json

{
  "identifier": "testuser",
  "password": "password123"
}
```

### **3. Bật đèn:**
```http
POST http://localhost:3001/api/devices/light/control
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "action": "turn_on"
}
```

### **4. Lấy dữ liệu sensor:**
```http
GET http://localhost:3001/api/environment/snapshot
Authorization: Bearer <accessToken>
```

### **5. Lấy lịch sử:**
```http
GET http://localhost:3001/api/environment/history?limit=20
Authorization: Bearer <accessToken>
```

---

## Cấu hình MQTT (trong .env)

```env
# MQTT Sensor Mapping
MQTT_SENSOR_MAP={"temp":"temperature","humidity":"humidity","light":"light","gas":"gas","3347512":"temperature","3352683":"humidity","3374959":"gas","3352680":"light"}

# MQTT Control Mapping
MQTT_CONTROL_TOPIC_MAP={"light":"HuyGia/feeds/button1","fan":"HuyGia/feeds/button2"}
MQTT_CONTROL_VALUE_MAP={"turn_on":"1","turn_off":"0"}

# MQTT Connection
REQUIRE_MQTT=true
MQTT_URL=mqtts://io.adafruit.com:8883
MQTT_USERNAME=HuyGia
MQTT_PASSWORD=
MQTT_TOPIC_TELEMETRY=HuyGia/feeds/+
MQTT_TOPIC_CONTROL=HuyGia/feeds/button1,HuyGia/feeds/button2
```

---

## Database Schema

### **Users table:**
- `u_id`: UUID (Primary Key)
- `username`: String (Unique)
- `email`: String (Unique)
- `password_hash`: String
- `role`: String (user/admin)
- `display_name`: String
- `created_at`: DateTime
- `updated_at`: DateTime

### **Environment_readings table:**
- `id`: Int (Primary Key, Auto Increment)
- `temperature`: Float (nullable)
- `humidity`: Float (nullable)
- `light`: Float (nullable)
- `gas`: Float (nullable)
- `captured_at`: DateTime
- `room_id`: String (nullable)
- `device_id`: String (nullable)

### **Devices table:**
- `device_id`: String (Primary Key)
- `type`: String
- `d_name`: String
- `created_at`: DateTime
- `updated_at`: DateTime

### **Control_logs table:**
- `id`: Int (Primary Key, Auto Increment)
- `device_id`: String
- `u_id`: String (nullable, Foreign Key to users.u_id)
- `event`: JSON
- `created_at`: DateTime

---

## WebSocket Events

Backend broadcast realtime events qua WebSocket:

### **Telemetry event:**
```json
{
  "type": "telemetry",
  "topic": "HuyGia/feeds/temp",
  "data": {
    "kind": "environment",
    "temperature": 28.5,
    "capturedAt": "2026-05-10T10:30:00.000Z"
  }
}
```

### **Face detected event:**
```json
{
  "type": "FACE_DETECTED",
  "data": {
    "action": "unlock",
    "user": "john_doe"
  }
}
```

---

## API Response Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `500`: Internal Server Error

---

## Security Notes

- JWT tokens expire after 15 minutes
- Refresh tokens expire after 7 days
- Passwords are hashed with bcrypt
- Admin role required for user management APIs
- All sensor/control APIs require authentication
- MQTT credentials are encrypted in transit (mqtts)