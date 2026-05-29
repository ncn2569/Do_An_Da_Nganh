# Tài liệu: Nhận diện khuôn mặt → Cấp quyền điều khiển giọng nói

## Tổng quan

Chuyển toàn bộ luồng nhận diện khuôn mặt từ mục đích **mở cửa** sang **xác thực quyền điều khiển bằng giọng nói**. Sau khi quét mặt, người dùng có thể ra lệnh bật/tắt đèn hoặc quạt — lệnh được gửi thẳng lên `HuyGia/feeds/voice`, YoloBoard tự xử lý chuyển thành tín hiệu điều khiển thiết bị.

---

## Luồng hoạt động cuối cùng

```
1. Login
      ↓
2. Vào trang "Face Verification" → Bật camera → Quét khuôn mặt
      ↓
3. AI Server nhận diện (confidence > 75%, tên trong ALLOWED_USERS, giữ 1s)
      ↓
4. POST http://localhost:3001/api/devices/face-access { action: "voice_grant", user_class: "nguyen" }
      ↓
5. Backend broadcast WebSocket { type: "VOICE_GRANTED", data: { user_class } }
      ↓
6. Frontend (App.tsx) nhận VOICE_GRANTED → mở khóa nút Mic, cấp phiên 5 phút
      ↓
7. Người dùng nhấn Mic → nói "bật đèn" / "tắt quạt" / ...
      ↓
8. POST /api/devices/voice-command { text: "bật đèn" }
      ↓
9. Backend publish "bật đèn" lên HuyGia/feeds/voice (MQTT)
      ↓
10. YoloBoard nhận → chuyển thành lệnh 0/1 cho đèn/quạt
```

---

## Các file đã thay đổi

### 🐍 `ai_sever/server.py`

| Trước | Sau |
|-------|-----|
| Cooldown 30s giữa các lần mở cửa | Không còn cooldown |
| Gửi `{ action: "unlock" }` | Gửi `{ action: "voice_grant" }` |
| Text trên camera: `HELLO [TÊN]!` | Text trên camera: `VOICE GRANTED: [TÊN]!` |
| Sau khi gửi vẫn giữ debounce | Reset `debounce_start_time = None` để không spam |

**Biến đã xóa:** `last_unlock_time`, `COOLDOWN_TIME`

---

### 🟨 `src/controllers/device.controller.js`

**Sửa `faceAccessWebhook`:**
```js
// Trước:
if (payload.action === "unlock") {
  broadcast({ type: "FACE_DETECTED", data: payload });
}

// Sau:
if (payload.action === "voice_grant") {
  broadcast({ type: "VOICE_GRANTED", data: payload });
}
```

**Thêm hàm `voiceCommand`:** nhận `{ text }` → gọi `publishVoiceCommand()` → broadcast `VOICE_COMMAND_SENT`.

---

### 🟨 `src/routes/device.routes.js`

Thêm 1 route mới:
```js
router.post("/voice-command", deviceController.voiceCommand);
```

---

### 🟨 `src/services/device.service.js`

Thêm hàm `publishVoiceCommand(text)`:
```js
async function publishVoiceCommand(text) {
  const topic = process.env.MQTT_VOICE_TOPIC || "HuyGia/feeds/voice";
  await publishAsync(getMqttClient(), topic, text);
}
```

---

### ⚙️ `.env`

Thêm 1 dòng:
```
MQTT_VOICE_TOPIC=HuyGia/feeds/voice
```

---

### ⚛️ `ui/src/services/api.ts`

Thêm method:
```ts
voiceCommand: (text: string) =>
  apiClient.post('/devices/voice-command', { text }),
```

---

### ⚛️ `ui/src/App.tsx`

**State mới:**
```ts
const [voiceGranted, setVoiceGranted] = useState(false);
const [voiceGrantedUser, setVoiceGrantedUser] = useState<string | null>(null);
const [voiceGrantExpiry, setVoiceGrantExpiry] = useState<number | null>(null);
```

**WebSocket listener** (global, ở App level):
- Lắng nghe `VOICE_GRANTED` → set `voiceGranted = true`, lưu tên user, set expiry 5 phút

**Timer tự thu hồi:**
- Sau 5 phút → `voiceGranted = false`, Mic tự khóa lại

**Voice dispatch — đơn giản nhất có thể:**
```ts
// Chỉ 1 dòng, thay vì loop qua từng device:
api.voiceCommand(matchedIntent).catch(err => console.error(err));
// matchedIntent = "bật đèn" | "tắt đèn" | "bật quạt" | "tắt quạt"
```

**Các nút Mic (ở TopBar và góc dưới phải):**
- `voiceGranted = false` → Cả 2 nút đều bị khóa, hiện icon `ShieldOff` xám, không thể bấm được (tooltip: "Cần quét mặt trước").
- `voiceGranted = true` → Cả 2 nút chuyển xanh, icon `Mic`, hoạt động bình thường để ra lệnh.

**Badge góc trái dưới** (khi đã xác thực):
```
🛡 Voice: nguyen | 4:59
```
Đếm ngược thời gian còn lại của phiên voice.

**Logout** → reset toàn bộ voice state.

---

### ⚛️ `ui/src/components/AccessSecurity.tsx`

| Trước | Sau |
|-------|-----|
| Lắng nghe `FACE_DETECTED` | Lắng nghe `VOICE_GRANTED` |
| Log hiển thị "AI Granted" | Log hiển thị "Voice Granted" |
| Sau nhận diện: nút "Unlock Door" | Sau nhận diện: thông báo "Voice Control Activated!" |
| Smart Lock card: icon Unlock, màu amber | Voice Status card: icon Mic, màu emerald |
| Text mô tả: "Quản lý cửa chính..." | Text mô tả: "Quét khuôn mặt để xác thực..." |
| Tiêu đề: "Security System" | Tiêu đề: "Face Verification" |
| Log tiêu đề: "Recent Access" | Log tiêu đề: "Voice Access Log" |

---

## Những gì KHÔNG thay đổi

- Danh sách `ALLOWED_USERS` trong `server.py` (vẫn 5 người)
- Ngưỡng confidence (vẫn 0.75)
- Thời gian hold still (vẫn 1 giây)
- Backend route `POST /devices/face-access` (vẫn giữ nguyên)
- Manual switch control trong `ControlDevices.tsx` (vẫn hoạt động độc lập)
- Các route khác của backend

---

## Lưu ý vận hành

1. Sau khi sửa `.env`, cần **restart Node.js server** để load `MQTT_VOICE_TOPIC` mới.
2. YoloBoard cần có code xử lý nhận text từ `HuyGia/feeds/voice` và chuyển thành lệnh 0/1 cho các feed đèn/quạt tương ứng.
3. Voice expiry **5 phút** — sau đó người dùng cần quét mặt lại để tiếp tục sử dụng voice control.
