# Tài liệu Tích hợp Trí tuệ Nhân tạo (AI Smart Suggestion)

Tài liệu này ghi chú chi tiết về luồng thiết kế, chuẩn bị dữ liệu và tích hợp tính năng Gợi ý Điều khiển Thiết bị bằng AI (AI Smart Suggestion) cho hệ thống Smart Home.

---

## 1. Tổng quan Tính năng
Hệ thống sử dụng AI (Machine Learning) để phân tích các thông số môi trường hiện tại (Nhiệt độ, Độ ẩm, Độ sáng, Khí Gas) và đưa ra gợi ý Bật/Tắt cho hai loại thiết bị chính: **Hệ thống Đèn (Light)** và **Hệ thống Quạt (Fan)**. Người dùng có quyền xem gợi ý và quyết định "Áp dụng ngay" hoặc bỏ qua.

---

## 2. Quá trình Chuẩn bị Dữ liệu & Xây dựng Model (Quan trọng)

### 2.1. Vấn đề của Dữ liệu thực tế (Real Data)
- **Tính thưa thớt (Sparsity):** Các cảm biến môi trường (Nhiệt độ, Độ sáng, Gas) không gửi dữ liệu đồng thời. Một bản ghi MQTT thường chỉ chứa 1 giá trị của 1 cảm biến, các cột còn lại bị `NULL`.
- **Thiếu đa dạng (Lack of Diversity):** Dữ liệu thu thập được từ nhà thực tế chỉ nằm trong một khoảng thời gian hẹp (từ 7h-12h sáng và một vài dòng lúc 15h chiều). Khoảng giá trị rất hẹp:
  - Nhiệt độ: 33.3 – 33.7°C
  - Độ ẩm: 56 – 58%
  - Độ sáng: 63 – 81 Lux
=> Nếu chỉ train AI trên tập dữ liệu này, AI sẽ bị "Overfitting" (học vẹt), không biết cách xử lý khi nhiệt độ xuống 25°C vào ban đêm hoặc độ sáng xuống 0 Lux.

### 2.2. Xử lý làm sạch và Sinh dữ liệu giả lập (Synthetic Data)
Để khắc phục điểm yếu của phần cứng, nhóm đã thực hiện:
1. **Gom nhóm dữ liệu thực:** Gộp các bản ghi thưa thớt trong các khoảng thời gian (5 giây) bằng phương pháp *Forward-fill* để tạo ra một bản ghi hoàn chỉnh có đủ 4 thông số.
2. **Data Augmentation (Tăng cường dữ liệu):** Viết script Python sinh ra dữ liệu môi trường giả lập 24/7 để tạo ra đủ các tình huống:
   - Sáng sớm / Đêm khuya: Nhiệt độ thấp, Độ sáng thấp.
   - Trưa nắng: Nhiệt độ cao, Độ sáng cao.
   - Các trường hợp đột biến: Khí gas tăng vọt (trên 3000).

### 2.3. Logic Gán nhãn và Các Ngưỡng (Thresholds)
Để dạy AI, hệ thống thiết lập các quy tắc (Rules) hợp lý mô phỏng thói quen con người bằng xác suất (để tránh AI học vẹt theo if-else quá cứng nhắc). Khi demo, bạn có thể dựa vào các ngưỡng này để điều chỉnh môi trường giả lập nhằm ép AI khuyên bật/tắt:

**A. Hệ thống Đèn (Light):**
Chủ yếu dựa vào *Độ sáng (Brightness)* và *Giờ trong ngày (Hour)*:
- **Ban đêm (21h - 5h):** Luôn có xu hướng BẬT đèn (xác suất ~97%).
- **Trời nhá nhem tối (17h - 21h) + Độ sáng < 45 Lux:** Ưu tiên BẬT đèn.
- **Sáng sớm (5h - 7h) + Độ sáng < 20 Lux:** Ưu tiên BẬT đèn.
- **Ban ngày (7h - 17h) + Trời nắng sáng (Độ sáng >= 65 Lux):** Chắc chắn TẮT đèn.
- **Ban ngày nhưng trời âm u (45 <= Độ sáng < 65 Lux):** Phân vân (50/50).

**B. Hệ thống Quạt (Fan):**
Chủ yếu dựa vào *Nhiệt độ (Temperature)*:
- **Trời rất nóng (Nhiệt độ >= 34.0°C):** Chắc chắn BẬT quạt (xác suất ~96%).
- **Trời oi bức (31.0°C <= Nhiệt độ < 34.0°C):** Ưu tiên BẬT quạt (~82%).
- **Trời mát vừa (28.0°C <= Nhiệt độ < 31.0°C):** Phân vân (45% bật).
- **Trời mát mẻ / Đêm khuya (Nhiệt độ < 28.0°C):** Ưu tiên TẮT quạt.

### 2.4. Huấn luyện Mô hình
- Chia thành **2 bài toán độc lập** và train 2 model riêng (`light1.pkl` và `fan1.pkl`) sử dụng thuật toán Random Forest Classifier.
- Việc tách riêng 2 model giúp AI học chính xác hơn, vì yếu tố làm bạn bật đèn hoàn toàn khác với yếu tố làm bạn bật quạt. Độ chính xác (Accuracy) đạt trên 90% với Đèn và >80% với Quạt.

---

## 3. Kiến trúc Tích hợp Hệ thống (System Architecture)

Tính năng AI hoạt động qua 3 tầng (3 Tiers):

### 3.1. Tầng AI Server (Python / FastAPI)
- Đóng vai trò như một Microservice (Chạy ở Port 8000).
- Cung cấp API `POST /suggest`. Nó nhận JSON chứa 4 thông số môi trường, dùng `joblib` để load mô hình Random Forest, thực hiện suy luận (Inference) và trả về kết quả `turn_on` hay `turn_off`.
- **Logic Giải thích Động (Dynamic Explanation):** Thay vì dùng if-else cứng nhắc, mã nguồn Python trích xuất trực tiếp:
  - `predict_proba()`: Lấy ra tỷ lệ % độ tự tin (Confidence/Xác suất) của quyết định.
  - `feature_importances_`: Lấy ra % đóng góp của từng thông số (Nhiệt độ, Độ sáng, Giờ...) vào quyết định đó, sắp xếp giảm dần để hiển thị minh bạch cho người dùng tại sao AI lại khuyên như vậy.

### 3.2. Tầng Backend API Gateway (Node.js)
- Cung cấp endpoint `GET /api/devices/ai-suggest` cho Frontend gọi.
- **Xử lý ghép dữ liệu môi trường:** Do dữ liệu trong bảng `environment` thưa thớt (có nhiều dòng null), Backend dùng truy vấn tìm kiếm phần tử khác `NULL` gần nhất (`findFirst({ not: null })`) cho TỪNG thông số độc lập (temp, humid, bright, gas).
- Sau khi có bộ số liệu môi trường đầy đủ và thực tế nhất hiện tại, Backend chuyển tiếp (Proxy) sang Python AI Server và trả về kết quả cho Frontend.

### 3.3. Tầng Giao diện (React)
- Nút bấm AI gợi ý hiển thị Popup UI đẹp mắt (dựa trên thông số Backend trả về).
- Khi người dùng bấm **Áp dụng ngay**, React sẽ chạy vòng lặp (map) duyệt qua danh sách Devices. Nếu phát hiện là `Light` hay `Fan` và có trạng thái khác với gợi ý của AI, hệ thống sẽ tự động gọi API `POST /api/devices/:id/control` để áp dụng cấu hình.

---

## 4. Xử lý Lỗi Đồng bộ (Optimistic Update Logic)

### Vấn đề gặp phải
Ban đầu, khi bấm "Áp dụng", lệnh MQTT được gửi xuống mạch phần cứng thành công nhưng giao diện App không thay đổi trạng thái (Bóng đèn không sáng lên). Nguyên nhân là Backend chỉ gửi lệnh MQTT đi chứ không cập nhật trạng thái mới vào Database (bảng `devices`). Do mạch ESP32 của dự án chưa code gửi tín hiệu "ACK" (phản hồi) ngược về, nên DB không bao giờ biết trạng thái đã đổi.

### Giải pháp kỹ thuật đã áp dụng
1. **Backend - Optimistic Update:** Trong file `src/services/device.service.js`, ngay sau khi gọi hàm `publishAsync` gửi MQTT, hệ thống được chèn thêm code chủ động dùng Prisma để Update cột `state` của thiết bị đó trong Database thành On/Off.
2. **Frontend - Event Trigger:** Trong file `App.tsx`, thay vì dùng `window.location.reload()` để lấy dữ liệu mới (điều này làm trang web load lại từ đầu, văng ra màn hình đăng nhập 1 giây gây khó chịu), nhóm dùng `window.dispatchEvent(new Event('refresh_devices'))`. 
3. Component `ControlDevices.tsx` được bổ sung `useEffect` lắng nghe Event này, và gọi `fetchData()` chạy ngầm. Kết quả là UI tự cập nhật màu sắc cực mượt mà, không giật lag.

---

## 5. Danh sách các file Code đã thêm/chỉnh sửa (Code Changes)
Để hoàn thiện toàn bộ luồng tính năng này, các thay đổi đã được áp dụng trên các file sau:

### 5.1. Tầng AI Server (Python)
- **File:** `ai_sever/server.py`
  - Khai báo model dữ liệu đầu vào `EnvironmentData` (temp, humid, bright, gas).
  - Thêm API `POST /suggest` dùng thư viện `joblib` để load mô hình (`light1.pkl` & `fan1.pkl`) và trả về json `{ "light": "turn_on", "fan": "turn_off" }`.

### 5.2. Tầng Backend (Node.js)
- **File:** `src/routes/device.routes.js`
  - Đăng ký thêm route mới `GET /ai-suggest`.
- **File:** `src/controllers/device.controller.js`
  - Viết hàm xử lý logic `getAISuggestions`. 
  - Khắc phục lỗi dữ liệu thưa bằng cách dùng `prisma.environment.findFirst` 4 lần (cho 4 thông số khác null gần nhất). Gọi proxy HTTP sang AI Server (port 8000).
- **File:** `src/services/device.service.js`
  - Sửa hàm `controlDevice()`. Thêm đoạn code **Optimistic Update**: tự động gọi `prisma.devices.update` đổi state vào thẳng DB ngay sau lệnh `publishAsync` MQTT.

### 5.3. Tầng Frontend (React/Vite)
- **File:** `ui/ui/src/services/api.ts`
  - Khai báo thêm hàm fetch API: `getAISuggestions: () => apiClient.get('/devices/ai-suggest')`.
- **File:** `ui/ui/src/App.tsx`
  - Thêm Icon "Ngôi sao" (`Sparkles`) làm nút bấm gọi AI Gợi ý kế bên nút Mic ở góc màn hình.
  - Vẽ Popup giao diện (Modal) hiển thị Nhiệt độ, Độ sáng thực tế và kết quả khuyên Bật/Tắt của AI.
  - Viết hàm `handleApplyAi()`: lặp qua toàn bộ devices, tìm thiết bị có tên chứa "light" hoặc "fan" để gửi API điều khiển. Sau khi xong sẽ chạy lệnh `window.dispatchEvent(new Event('refresh_devices'))`.
- **File:** `ui/ui/src/components/ControlDevices.tsx`
  - Thêm đoạn code `useEffect` đăng ký bộ lắng nghe sự kiện (`window.addEventListener('refresh_devices')`). Khi nghe tín hiệu từ `App.tsx`, hàm `fetchData()` sẽ được gọi để ngầm đồng bộ lại trạng thái từ CSDL lên giao diện.

---
