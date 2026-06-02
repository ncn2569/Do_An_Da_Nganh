import React, { useState, useEffect } from 'react';
import {
  Shield,
  Unlock,
  Lock,
  Plus,
  CheckCircle2,
  XCircle,
  Camera,
  VideoOff,
  Mic,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { api } from '../services/api';

interface AccessSecurityProps {
  role: 'Admin' | 'Member';
}

export function AccessSecurity({ role }: AccessSecurityProps) {
  const [isLocked, setIsLocked] = useState(true);
  const [dynamicLog, setDynamicLog] = useState<Array<{ name: string; time: string; status: string; type: string }>>([]);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [detectedFace, setDetectedFace] = useState<{ name: string; confidence: number } | null>(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      // Release webcam immediately so Python backend can open the laptop camera.
      mediaStream.getTracks().forEach((track) => track.stop());
      setIsCameraOn(true);
    } catch (error) {
      console.error('Error accessing the camera:', error);
      alert('Cannot access the camera. Please check the permissions in your browser.');
    }
  };

  const stopCamera = () => {
    setIsCameraOn(false);
    setDetectedFace(null);
  };

  useEffect(() => {
    const fetchVoiceHistory = async () => {
      try {
        const res = await api.getGlobalDeviceHistory({ limit: 100 });
        if (res?.data?.data) {
          const voiceCommands = res.data.data.filter((item: any) => item.event?.source === 'voice_command');
          const formatted = voiceCommands.map((item: any) => {
             const isOn = ['ON', 'TURN_ON'].includes(String(item.event?.action).toUpperCase());
             return {
                name: `${item.event?.faceUser || 'Unknown'} (Voice)`,
                time: new Date(item.time || item.timestamp || new Date()).toLocaleString(),
                status: `${isOn ? 'Turned ON' : 'Turned OFF'} ${item.devices?.d_name || 'Device'}`,
                type: 'success'
             };
          });
          setDynamicLog(formatted);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchVoiceHistory();
  }, []);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'VOICE_GRANTED') {
          setIsLocked(false);
          setDynamicLog((prev) => [
            {
              name: msg.data.user_class,
              time: new Date().toLocaleTimeString(),
              status: 'Voice Granted',
              type: 'success',
            },
            ...prev,
          ]);
          setDetectedFace({
            name: msg.data.user_class,
            confidence: Number(msg.data.confidence || 0),
          });
          // Tự xóa thông báo sau 10 giây
          setTimeout(() => setDetectedFace(null), 10000);
        } else if (msg.type === 'DEVICE_ACTION' && msg.data.userName?.includes('(Voice)')) {
          const isOn = ['ON', 'TURN_ON'].includes(String(msg.data.action).toUpperCase());
          setDynamicLog((prev) => [
            {
              name: msg.data.userName,
              time: new Date(msg.data.timestamp).toLocaleTimeString(),
              status: `${isOn ? 'Turned ON' : 'Turned OFF'} ${msg.data.deviceName}`,
              type: 'success',
            },
            ...prev,
          ]);
        }
      } catch (_) {}
    };
    return () => ws.close();
  }, []);

  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="shrink-0 md:flex-row md:items-center md:justify-between flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Face Verification</h2>
          <p className="mt-1 text-sm text-slate-500">Scan your face to verify and unlock the Voice Control feature.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {role === 'Admin' && (
            <Button className="bg-[#0033CC] text-white shadow-md transition-all hover:bg-[#0027a3]">
              <Plus className="mr-2 h-4 w-4" />
              Add New Face
            </Button>
          )}
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:bg-slate-50">
            <Shield className="mr-2 h-4 w-4" />
            Security Status
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-6 lg:grid-cols-3 lg:items-stretch">
        <Card className="lg:col-span-2 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
          <CardHeader className="shrink-0 border-b border-slate-100 bg-slate-50/80 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                <Camera className="h-5 w-5 text-blue-600" />
                Face Recognition Entry
              </CardTitle>
              <Badge className={isCameraOn ? 'animate-pulse bg-red-500 text-white shadow-sm hover:bg-red-600' : 'border border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'}>
                {isCameraOn ? 'LIVE' : 'OFFLINE'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col justify-between gap-6 bg-white p-6">
            <div className="relative flex w-full shrink-0 aspect-video overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-inner">
              {isCameraOn ? (
                <img
                  src="http://localhost:8000/video_feed"
                  alt="AI Camera Feed"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_50%)]" />
                  <div className="z-10 flex flex-col items-center justify-center gap-3 text-slate-400">
                    <div className="rounded-full bg-slate-800/50 p-4 backdrop-blur-sm">
                      <VideoOff className="h-10 w-10 opacity-70" />
                    </div>
                    <p className="text-sm font-medium tracking-wide">Camera is currently off</p>
                  </div>
                </div>
              )}

              {isCameraOn && (
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
                  <div className="flex justify-between items-start">
                    <Badge className="border-white/10 bg-black/40 text-white backdrop-blur-md">
                      Front Door Camera
                    </Badge>
                  </div>

                  {detectedFace && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="h-48 w-40 animate-pulse rounded-xl border-2 border-emerald-400/80 shadow-[0_0_15px_rgba(52,211,153,0.3)]" />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    {detectedFace && (
                      <Badge className="border-none bg-emerald-500/90 font-medium text-white shadow-sm backdrop-blur-md">
                        {detectedFace.name} ({detectedFace.confidence}%)
                      </Badge>
                    )}
                    <Badge className="ml-auto border-white/10 bg-black/60 font-mono text-xs text-slate-200 backdrop-blur-md">
                      {new Date().toLocaleTimeString()}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            {isCameraOn && detectedFace && (
              <div className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-emerald-100 p-2">
                    <Mic className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Voice Control Activated!</p>
                    <p className="text-xs text-slate-600">
                      Hello <span className="font-semibold capitalize">{detectedFace.name}</span>! You can give commands for 5 minutes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-auto shrink-0 pt-2">
              <Button
                variant={isCameraOn ? 'destructive' : 'default'}
                className={`w-full py-6 text-base font-semibold transition-all ${!isCameraOn ? 'bg-[#0033CC] text-white shadow-md hover:bg-[#0027a3]' : 'shadow-md'}`}
                onClick={isCameraOn ? stopCamera : startCamera}
              >
                <Camera className="mr-2 h-5 w-5" />
                {isCameraOn ? 'Turn Off Camera' : 'Connect to Camera'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-1 flex flex-col gap-6">
          <Card className="shrink-0 rounded-xl border border-slate-200 bg-white shadow-md">
            <CardHeader className="border-b border-slate-100 bg-slate-50/80 pb-3 pt-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
                <Shield className="h-4 w-4 text-slate-400" />
                Smart Lock
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center p-6">
              <div className={`relative mb-5 flex h-20 w-20 items-center justify-center rounded-full border-[4px] shadow-inner transition-all duration-500 ${isLocked ? 'border-slate-100 bg-slate-50' : 'border-emerald-100 bg-emerald-50'}`}>
                {isLocked ? (
                  <Lock className="h-8 w-8 animate-in zoom-in text-slate-600 duration-300" />
                ) : (
                  <Mic className="h-8 w-8 animate-in zoom-in text-emerald-500 duration-300" />
                )}
              </div>

              <div className="mb-4 text-center">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">Voice Status</p>
                <h3 className={`text-2xl font-bold transition-colors ${isLocked ? 'text-slate-800' : 'text-emerald-600'}`}>
                  {isLocked ? 'Locked' : 'Voice Ready'}
                </h3>
              </div>

              <p className="text-center text-xs text-slate-400 leading-relaxed">
                {isLocked
                  ? 'Bật camera và quét khuôn mặt để kích hoạt giọng nói.'
                  : <>Nói <span className="font-semibold text-slate-600">"bật đèn"</span>, <span className="font-semibold text-slate-600">"tắt quạt"</span>... qua nút mic.</>
                }
              </p>
            </CardContent>
          </Card>

          <Card className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md max-h-[400px] lg:max-h-[600px]">
            <CardHeader className="flex shrink-0 flex-row items-center justify-between border-b border-slate-100 bg-slate-50/80 pb-3 pt-4">
              <CardTitle className="text-base font-semibold text-slate-700">Voice Access Log</CardTitle>
              <Button variant="link" className="h-auto p-0 text-xs font-semibold text-[#0033CC] hover:text-blue-800 hover:no-underline">
                View All
              </Button>
            </CardHeader>

            <CardContent className="custom-scrollbar flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {dynamicLog.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:bg-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full border bg-white p-2 shadow-sm ${item.type === 'success' ? 'border-emerald-100 text-emerald-500' : 'border-rose-100 text-rose-500'}`}>
                        {item.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{item.time}</p>
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={`border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ${item.type === 'success' ? 'border-emerald-200 bg-emerald-50/50 text-emerald-600' : 'border-rose-200 bg-rose-50/50 text-rose-600'}`}
                    >
                      {item.status}
                    </Badge>
                  </div>
                ))}
                {dynamicLog.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    Chưa có access log từ backend. Danh sách sẽ cập nhật khi có sự kiện realtime.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
