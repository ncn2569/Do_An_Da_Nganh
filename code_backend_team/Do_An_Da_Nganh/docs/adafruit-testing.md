# Adafruit + Neon runbook

Tai lieu nay mo ta cach chay backend, ket noi Adafruit IO va Neon Postgres, va test tung phan.

## 1. Muc tieu cua luong

Luồng hien tai:

1. ESP32 hoac Adafruit IO publish sensor data len feed.
2. Backend subscribe MQTT tu Adafruit IO.
3. Backend map ten feed sensor -> field du lieu (`temperature`, `humidity`, `light`, `gas`).
4. Backend luu reading vao bang `environment`.
5. Frontend goi REST API de lay latest data, history, hoac control thiet bi.
6. Khi frontend control, backend publish len feed button cua Adafruit.

## 2. Cau hinh hien tai

Backend dang dung:

- Adafruit username: `HuyGia`
- MQTT broker: `mqtts://io.adafruit.com:8883`
- Telemetry subscribe: `HuyGia/feeds/+`
- Light control feed: `HuyGia/feeds/button1`
- Fan control feed: `HuyGia/feeds/button2`
- Neon Postgres: lay tu `DATABASE_URL` trong `.env`

Map control hien tai:

- `light` -> `HuyGia/feeds/button1`
- `fan` -> `HuyGia/feeds/button2`
- `button3` -> `HuyGia/feeds/button3` (che do tu dong bat/tat den)
- `button4` -> `HuyGia/feeds/button4` (che do tu dong bat/tat quat)
- `turn_on` -> `1`
- `turn_off` -> `0`

Map sensor hien tai:

```env
MQTT_SENSOR_MAP={"temp":"temperature","humidity":"humidity","light":"light","gas":"gas","3347512":"temperature","3352683":"humidity","3374959":"gas","3352680":"light"}
```

Y nghia:

- Neu Adafruit co feed `temp`, backend hieu day la nhiet do.
- Neu Adafruit co feed `humidity`, backend hieu day la do am.
- Neu Adafruit co feed `light`, backend hieu day la cuong do anh sang.
- Neu Adafruit co feed `gas`, backend hieu day la muc gas khoi.
- Feed `3347512` dang duoc map thanh `temperature`.
- Feed `3352683` dang duoc map thanh `humidity`.
- Feed `3374959` dang duoc map thanh `gas`.
- Feed `3352680` dang duoc map thanh `light`.

Neu feed sensor thuc te cua ban co ten khac, chi can sua `MQTT_SENSOR_MAP`.

Vi du:

```env
MQTT_SENSOR_MAP={"nhietdo":"temperature","doam":"humidity","anhsang":"light","khoi":"gas"}
```

## 3. Cach chay backend

### Cach 1: chay bang terminal

Mo terminal trong thu muc backend:

```powershell
cd backend-smarthome
node server.js
```

Neu server len thanh cong, backend se:

- connect Neon Postgres
- connect Adafruit MQTT
- mo HTTP server tai `http://localhost:3001`

### Cach 2: dev mode

```powershell
cd E:\Study\doan\Do_An_Da_Nganh\backend-smarthome
npm run dev
```

Neu PowerShell bao loi vi `npm.ps1` bi chan, dung:

```powershell
npm.cmd run dev
```

### Cach 3: chay background de test nhanh

Backend da co script quan ly process nen:

```powershell
npm.cmd run start:bg
npm.cmd run status:bg
npm.cmd run stop:bg
```

Y nghia:

- `start:bg`: chay backend nen, ghi PID vao `.server.pid`, log vao `.server.log`
- `status:bg`: kiem tra backend nen con chay khong
- `stop:bg`: tat process backend nen dung theo PID file

File lien quan:

- PID file: `.server.pid`
- Log file: `.server.log`

### Health check

Mo trinh duyet hoac dung curl:

```powershell
curl http://localhost:3001/health
```

Ket qua mong doi:

```json
{"ok":true}
```

### Loi hay gap: `EADDRINUSE`

Neu ban thay loi:

```text
Error: listen EADDRINUSE: address already in use :::3001
```

co nghia la da co 1 backend khac dang chiem cong `3001`.

Cach xu ly:

1. Neu da chay nen truoc do:

```powershell
npm.cmd run stop:bg
```

2. Sau do chay lai:

```powershell
npm.cmd run dev
```

3. Hoac doi `PORT` trong `.env` neu ban muon chay song song nhieu instance.

## 4. Test MQTT sensor -> database

Muc tieu: kiem tra sensor data tu Adafruit co duoc backend nhan va luu vao bang `environment` khong.

### Cach test de nhat

1. Vao dashboard Adafruit IO.
2. Chon mot feed sensor, vi du `temp`.
3. Publish thu mot gia tri, vi du `29.5`.
4. Backend dang subscribe `HuyGia/feeds/+` se nhan du lieu.
5. Backend map `temp` -> `temperature`.
6. Backend luu 1 dong moi vao bang `environment`.

Voi setup hien tai cua ban, co the hieu thuc te nhu sau:

1. Feed `3347512` publish gia tri khoang `33.7` -> backend luu vao cot `temp`.
2. Feed `3352683` publish gia tri khoang `59.3` -> backend luu vao cot `humidity`.
3. Feed `3374959` publish gia tri khoang `433-447` -> backend luu vao cot `gas_level`.
4. Feed `3352680` publish gia tri khoang `80-83` -> backend luu vao cot `bright`.

### API de kiem tra du lieu vua luu

Sau khi sensor publish, frontend hoac Postman co the goi:

```http
GET http://localhost:3001/api/environment/latest
Authorization: Bearer <token>
```

Hoac lay lich su:

```http
GET http://localhost:3001/api/environment/history?limit=20
Authorization: Bearer <token>
```

Neu setup dung, response se co field nhu:

```json
{
  "data": {
    "temp": 29.5,
    "humidity": null,
    "bright": null,
    "gas_level": null
  }
}
```

Neu ban publish vao feed `humidity`, `light`, `gas` thi backend se luu vao cot tuong ung.

## 4.1. Giai thich hinh tren Neon

Hinh ban gui tren Neon la dung voi code hien tai, khong phai loi.

Y nghia cua bang `environment`:

- Moi message MQTT tao ra 1 dong moi trong bang.
- Vi Adafruit cua ban dang publish tung feed rieng le, moi dong thuong chi co 1 cot co gia tri.
- Cac cot con lai se la `NULL`.

Vi du:

- 1 message tu feed temperature -> tao 1 dong co `temp = 33.7`, cac cot `bright`, `humidity`, `gas_level` la `NULL`.
- 1 message tu feed humidity -> tao 1 dong co `humidity = 57.3`, cac cot khac la `NULL`.
- 1 message tu feed light -> tao 1 dong co `bright = 82`, cac cot khac la `NULL`.
- 1 message tu feed gas -> tao 1 dong co `gas_level = 3411` hoac `433`, cac cot khac la `NULL`.

Noi cach khac, backend hien tai dang luu theo kieu "event log":

- moi sensor reading la 1 ban ghi
- khong gom 4 sensor vao cung 1 dong

Day la ly do tren Neon ban thay:

- dong nay chi co `temp`
- dong kia chi co `humidity`
- dong tiep theo chi co `bright`
- dong tiep nua chi co `gas_level`

Dieu nay hop ly neu:

- ban muon luu lich su day du tung reading
- sensor gui khac thoi diem
- frontend tu tong hop latest values de hien thi dashboard

Neu sau nay ban muon moi thoi diem chi co 1 dong gom du 4 gia tri (`temp`, `humidity`, `bright`, `gas_level`), thi can doi chien luoc luu:

1. hoac ESP32 publish 1 JSON tong hop
2. hoac backend gom tam 4 feed gan nhau roi moi insert 1 dong

Voi code hien tai, frontend nen dung:

- `GET /api/environment/history` de ve chart
- `GET /api/environment/latest` de xem reading moi nhat

Va neu can snapshot dashboard "du 4 chi so cung luc", backend da co san 1 API tong hop latest non-null cho tung metric.

API nay la:

```http
GET /api/environment/snapshot
```

Response mau:

```json
{
  "data": {
    "room": null,
    "temperature": {
      "value": 33.7,
      "capturedAt": "2026-05-07T08:17:51.000Z",
      "sourceReadingId": 14
    },
    "humidity": {
      "value": 59.4,
      "capturedAt": "2026-05-07T08:17:51.000Z",
      "sourceReadingId": 11
    },
    "light": {
      "value": 82,
      "capturedAt": "2026-05-07T08:17:51.000Z",
      "sourceReadingId": 15
    },
    "gas": {
      "value": 433,
      "capturedAt": "2026-05-07T08:17:31.000Z",
      "sourceReadingId": 12
    }
  }
}
```

Y nghia:

- Moi metric lay gia tri moi nhat khong `NULL`.
- `capturedAt` cho frontend biet chi so do duoc cap nhat luc nao.
- `sourceReadingId` cho phep trace nguoc ve dong trong bang `environment` neu can debug.

## 5. Test control den va quat

Muc tieu: kiem tra frontend goi API -> backend publish dung feed Adafruit.

### Bat den

```http
POST http://localhost:3001/api/devices/light/control
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "turn_on"
}
```

Backend se publish:

- topic: `HuyGia/feeds/button1`
- value: `1`

### Tat den

```http
POST http://localhost:3001/api/devices/light/control
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "turn_off"
}
```

Backend se publish:

- topic: `HuyGia/feeds/button1`
- value: `0`

### Bat quat

```http
POST http://localhost:3001/api/devices/fan/control
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "turn_on"
}
```

Backend se publish:

- topic: `HuyGia/feeds/button2`
- value: `1`

### Tat quat

```http
POST http://localhost:3001/api/devices/fan/control
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "turn_off"
}
```

Backend se publish:

- topic: `HuyGia/feeds/button2`
- value: `0`

## 6. Danh sach API cho frontend

### Environment

Lay nhieu reading moi nhat:

```http
GET /api/environment?limit=50
```

Lay reading moi nhat:

```http
GET /api/environment/latest
```

Lay snapshot dashboard gom du 4 chi so:

```http
GET /api/environment/snapshot
```

Lay history de ve chart:

```http
GET /api/environment/history?limit=100
```

Lay snapshot moi nhat theo tung phong:

```http
GET /api/environment/rooms/latest
```

### Device control

```http
POST /api/devices/light/control
POST /api/devices/fan/control
```

## 7. Cach lay token de test API

Neu backend auth dang bat, ban can token.

Co the login bang:

```http
POST /api/users/login
Content-Type: application/json

{
  "email": "your-email",
  "password": "your-password"
}
```

Backend se tra token:

```json
{
  "token": "..."
}
```

Sau do gan vao header:

```http
Authorization: Bearer <token>
```

## 8. Troubleshooting nhanh

### Backend len nhung khong co data sensor

Kiem tra:

- Adafruit co dang publish dung feed khong
- Feed name co khop `MQTT_SENSOR_MAP` khong
- Backend co dang chay khong
- `MQTT_TOPIC_TELEMETRY` co la `HuyGia/feeds/+` khong

Neu chay background, kiem tra them:

```powershell
npm.cmd run status:bg
Get-Content .server.log -Tail 50
```

### Backend co data nhung sai cot

Vi du publish feed `nhietdo` nhung backend khong luu vao `temp`.

Sua lai:

```env
MQTT_SENSOR_MAP={"nhietdo":"temperature"}
```

### API control goi thanh cong nhung den/quat khong chay

Kiem tra:

- ESP32 co subscribe dung `HuyGia/feeds/button1` va `HuyGia/feeds/button2` khong
- Firmware co dang cho `1/0` hay `ON/OFF`

Neu firmware can `ON/OFF`, sua:

```env
MQTT_CONTROL_VALUE_MAP={"turn_on":"ON","turn_off":"OFF"}
```

### `start:bg` chay xong roi tat ngay

Kiem tra log:

```powershell
Get-Content .server.log -Tail 50
```

Nguyen nhan thuong gap:

- sai `DATABASE_URL`
- khong ket noi duoc Neon
- sai MQTT credentials
- da co process khac chiem cong `3001`

### Goi `/api/devices/light/control` ma publish sai topic

Kiem tra:

```env
MQTT_CONTROL_TOPIC_MAP={"light":"HuyGia/feeds/button1","fan":"HuyGia/feeds/button2"}
```

## 9. Checklist test end-to-end

1. Chay backend.
2. Kiem tra `GET /health`.
3. Login lay token.
4. Publish thu sensor tren Adafruit.
5. Goi `GET /api/environment/latest`.
6. Goi `GET /api/environment/snapshot`.
7. Goi `GET /api/environment/history?limit=20`.
8. Goi `POST /api/devices/light/control` voi `turn_on`.
9. Goi `POST /api/devices/fan/control` voi `turn_off`.
10. Goi `POST /api/devices/button3/control` de test che do tu dong den.
11. Goi `POST /api/devices/button4/control` de test che do tu dong quat.
12. Xac nhan Adafruit feed va ESP32 nhan dung data.

## 10. Files lien quan trong backend

- MQTT ingest: [src/iot/mqttHandler.js](/E:/Study/doan/Do_An_Da_Nganh/backend-smarthome/src/iot/mqttHandler.js:1)
- Save/query environment: [src/services/environment.service.js](/E:/Study/doan/Do_An_Da_Nganh/backend-smarthome/src/services/environment.service.js:1)
- Environment APIs: [src/routes/environment.routes.js](/E:/Study/doan/Do_An_Da_Nganh/backend-smarthome/src/routes/environment.routes.js:1)
- Device control publish: [src/services/device.service.js](/E:/Study/doan/Do_An_Da_Nganh/backend-smarthome/src/services/device.service.js:1)
- Runtime config: [.env](/E:/Study/doan/Do_An_Da_Nganh/backend-smarthome/.env:1)
- Background start script: [scripts/start-bg.js](/E:/Study/doan/Do_An_Da_Nganh/backend-smarthome/scripts/start-bg.js:1)
- Background stop script: [scripts/stop-bg.js](/E:/Study/doan/Do_An_Da_Nganh/backend-smarthome/scripts/stop-bg.js:1)
- Background status script: [scripts/status-bg.js](/E:/Study/doan/Do_An_Da_Nganh/backend-smarthome/scripts/status-bg.js:1)
