# Cập nhật luồng Voice Control (Đồng bộ UI & Database)

## Tóm tắt vấn đề cũ
Trong phiên bản trước, khi nhận diện giọng nói (VD: "bật đèn"), Backend chỉ đơn thuần publish chuỗi `"bật đèn"` xuống topic MQTT `HuyGia/feeds/voice` để mạch YoloBoard xử lý. Việc này dẫn đến 2 thiếu sót:
1. Giao diện (Frontend) không tự động chuyển trạng thái của nút bấm (không biết là đèn đã bật).
2. Database (bảng `control_log` và `devices`) không ghi nhận lịch sử thiết bị đã được bật/tắt, và không ghi nhận được danh tính người đã xác thực khuôn mặt để ra lệnh.

## Giải pháp & Các thay đổi

### 1. Cập nhật Database & Control Log (Backend)
- Gắn thêm middleware xác thực `authMiddleware` vào route `POST /voice-command` để lấy thông tin user đang đăng nhập (`req.user`).
- Hàm `voiceCommand` (Controller) nay nhận thêm tham số `faceUser` (tên người đã xác thực khuôn mặt) từ Frontend gửi lên.
- Trong `device.service.js`, hàm `publishVoiceCommand`:
  - Vẫn publish chuỗi `"bật đèn"` xuống YoloBoard như cũ.
  - Phân tích cú pháp chuỗi lệnh để tìm ra loại thiết bị (`light` hoặc `fan`) và hành động tương ứng (`turn_on` hoặc `turn_off`).
  - Truy vấn toàn bộ các thiết bị thỏa mãn loại đó trong DB và **đồng loạt** cập nhật `state`.
  - Tạo `control_log` cho mỗi thiết bị, gắn kèm thông tin `source: "voice_command"`, `faceUser` (người quét mặt), và `u_id` (người đang đăng nhập).

### 2. Cập nhật Realtime UI (WebSocket & Frontend)
- Sau khi ghi log xong, Backend phát Broadcast WebSocket `DEVICE_ACTION` cho các thiết bị vừa được cập nhật, với định dạng tên hiển thị là `[Tên khuôn mặt] (Voice)`.
- Ở Frontend (`App.tsx`), khi nhận được sự kiện `DEVICE_ACTION`, sẽ tự động phát tín hiệu `refresh_devices` giúp cho các công tắc ở trang Điều Khiển tự động gạt bật/tắt mà không cần F5.

### 3. Nâng cấp Log Hiện Thị (Frontend)
- **Trang Dashboard Overview**: Chỉnh sửa lại hàm hiển thị log để tự động format tên người dùng có kèm chữ `(Voice)` (VD: `Nguyen (Voice) just turned on Main Light`) dựa theo `source` của event trong DB. Đồng thời sửa lỗi nhận diện sai chữ HOA/thường khi check trạng thái hành động (`isOn`).
- **Trang Access Security**: Gọi API để truy xuất dữ liệu từ `control_log`, lọc lấy riêng các event có `source: "voice_command"` để tạo bảng **Voice Access Log** chuẩn xác, tải được lịch sử cũ kể cả khi F5, và cập nhật theo thời gian thực mỗi khi có lệnh giọng nói mới.

## Cách kiểm thử
1. Đăng nhập vào trang web.
2. Vào màn hình Security, bật Camera và quét mặt để kích hoạt quyền Voice.
3. Ra lệnh "bật đèn" hoặc "tắt quạt".
4. Chuyển sang màn hình Dashboard hoặc Control để xác nhận các nút đã tự động cập nhật và bảng lịch sử lưu rõ ai là người thực hiện.
