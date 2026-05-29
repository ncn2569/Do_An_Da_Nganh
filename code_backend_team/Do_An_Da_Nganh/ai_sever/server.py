import os
import sys

# Chặn hoàn toàn các luồng log của C++ và TensorFlow từ hệ điều hành
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['GLOG_minloglevel'] = '2'
os.environ['GRPC_VERBOSITY'] = 'NONE' # Bịt miệng thằng GRPC (Clearcut dùng cái này)

# Ép hệ thống chuyển hướng mọi lỗi C++ rác vào "hố đen"
if sys.platform == "win32":
    os.environ['OPENCV_VIDEOIO_PRIORITY_MSMF'] = '0'

import cv2
import numpy as np
import mediapipe as mp
from keras_facenet import FaceNet
import joblib
import time
import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel
from datetime import datetime
import pandas as pd

# Khởi tạo AI models
embedder = FaceNet()
ml_models = {"svm": None}

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ml_models["svm"] = joblib.load("svm_model_full.pkl")
    except: pass
    
    try:
        ml_models["light"] = joblib.load("light1.pkl")
        ml_models["fan"] = joblib.load("fan1.pkl")
    except Exception as e:
        print(f"Lỗi load ML model: {e}")
    yield
    ml_models.clear()

app = FastAPI(lifespan=lifespan)

# Cấu hình MediaPipe
BaseOptions = mp.tasks.BaseOptions
FaceDetector = mp.tasks.vision.FaceDetector
FaceDetectorOptions = mp.tasks.vision.FaceDetectorOptions
VisionRunningMode = mp.tasks.vision.RunningMode

options = FaceDetectorOptions(
    base_options=BaseOptions(model_asset_path='blaze_face_short_range.tflite'),
    running_mode=VisionRunningMode.IMAGE
)

def gen_frames():
    detector = FaceDetector.create_from_options(options)
    cap = cv2.VideoCapture(0) # 2 là Cam điện thoại 1 là cam lap top 0 là cam phần mềm irinium webcam
    
    debounce_start_time = None
    REQUIRED_TIME = 1
    
    # KHAI BÁO DANH SÁCH NGƯỜI NHÀ ĐƯỢC CẤP QUYỀN VOICE CONTROL
    ALLOWED_USERS = ["nguyen","bao","huygia","thien","khang"] # Thay bằng các class (tên) bạn đã train
    try:
        while True:
            success, frame = cap.read()
            if not success: break
            frame = cv2.flip(frame, 1)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            detection_result = detector.detect(mp_image)
            
            face_detected_this_frame = False
            if detection_result.detections:
                for detection in detection_result.detections:
                    face_detected_this_frame = True
                    bbox = detection.bounding_box
                    x, y, w, h = bbox.origin_x, bbox.origin_y, bbox.width, bbox.height
                    
                    face_img = frame[max(0, y):y+h, max(0, x):x+w]
                    if face_img.size > 0:
                        face_img_resized = cv2.resize(face_img, (160, 160))
                        embedding = embedder.embeddings([face_img_resized])[0]
                        
                        prob = ml_models["svm"].predict_proba(embedding.reshape(1, -1))[0]
                        max_idx = np.argmax(prob)
                        name = ml_models["svm"].classes_[max_idx]
                        confidence = prob[max_idx]
                        
                        box_color = (0, 0, 255)
                        text = f"DENIED: {name.upper()} ({confidence:.2f})"
                        
                        # NÂNG NGƯỠNG CONFIDENCE > 0.75 VÀ KIỂM TRA ĐÚNG NGƯỜI NHÀ KHÔNG
                        if confidence > 0.75 and name.lower() in ALLOWED_USERS:
                            if debounce_start_time is None: 
                                debounce_start_time = time.time()
                            elapsed = time.time() - debounce_start_time
                            
                            if elapsed >= REQUIRED_TIME:
                                # ĐỦ 1 GIÂY → CẤP QUYỀN VOICE CONTROL, GỬI API MỘT LẦN
                                box_color = (0, 255, 0)
                                text = f"VOICE GRANTED: {name.upper()}!"
                                
                                try:
                                    requests.post("http://localhost:3001/api/devices/face-access", 
                                                json={"action": "voice_grant", "user_class": name}, timeout=0.5)
                                except: pass
                                
                                # Reset debounce để không gửi liên tục
                                debounce_start_time = None
                            else:
                                # Đang đứng đếm đủ 1s
                                box_color = (0, 255, 255)
                                text = f"HOLD STILL... {REQUIRED_TIME - elapsed:.1f}s"
                        else:
                            # Người lạ hoặc độ tin cậy quá thấp
                            debounce_start_time = None

                        cv2.rectangle(frame, (x, y), (x+w, y+h), box_color, 2)
                        cv2.putText(frame, text, (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)

            if not face_detected_this_frame: 
                debounce_start_time = None

            ret, buffer = cv2.imencode('.jpg', frame)
            yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
    finally: 

        cap.release()
        
class EnvironmentData(BaseModel):
    temperature: float
    humidity: float
    brightness: float
    gas_level: float

@app.post("/suggest")
async def suggest_device_actions(data: EnvironmentData):
    if not ml_models.get("light") or not ml_models.get("fan"):
        raise HTTPException(status_code=500, detail="ML Models (light.pkl, fan.pkl) not loaded.")
        
    now = datetime.now()
    # Tạo DataFrame để trùng khớp với tên columns lúc train trên Kaggle
    input_df = pd.DataFrame([{
        'hour_of_day': now.hour,
        'day_of_week': now.weekday(),
        'temperature': data.temperature,
        'humidity': data.humidity,
        'brightness': data.brightness,
        'gas_level': data.gas_level
    }])
    
    # Dự đoán và lấy xác suất (Probability)
    light_proba = ml_models["light"].predict_proba(input_df)[0]
    light_pred = ml_models["light"].classes_[np.argmax(light_proba)]
    light_conf = np.max(light_proba) * 100

    fan_proba = ml_models["fan"].predict_proba(input_df)[0]
    fan_pred = ml_models["fan"].classes_[np.argmax(fan_proba)]
    fan_conf = np.max(fan_proba) * 100
    
    # Trích xuất TOÀN BỘ yếu tố và phần trăm đóng góp từ Feature Importances của mô hình
    features = input_df.columns
    
    light_importances = ml_models["light"].feature_importances_
    light_sorted_idx = np.argsort(light_importances)[::-1]
    light_all_features = [f"{features[i]} ({light_importances[i]*100:.1f}%)" for i in light_sorted_idx]
    
    fan_importances = ml_models["fan"].feature_importances_
    fan_sorted_idx = np.argsort(fan_importances)[::-1]
    fan_all_features = [f"{features[i]} ({fan_importances[i]*100:.1f}%)" for i in fan_sorted_idx]

    # Tạo chuỗi giải thích
    light_reason = f"Xác suất: {light_conf:.1f}%. Ảnh hưởng: {', '.join(light_all_features)}"
    fan_reason = f"Xác suất: {fan_conf:.1f}%. Ảnh hưởng: {', '.join(fan_all_features)}"
    
    return {
        "ok": True,
        "suggestions": {
            "light": light_pred,
            "fan": fan_pred
        },
        "reasons": {
            "light": light_reason,
            "fan": fan_reason
        }
    }

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(gen_frames(), media_type="multipart/x-mixed-replace; boundary=frame")