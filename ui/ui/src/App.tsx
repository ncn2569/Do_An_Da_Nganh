import React, { useState, useEffect } from 'react';
import { Mic, X, ShieldCheck, ShieldOff, Sparkles, Loader2, Check, Lightbulb, Wind } from 'lucide-react';
import { DashboardOverview } from './components/DashboardOverview';
import { EnvironmentDevices } from './components/ControlDevices';
import { AccessSecurity } from './components/AccessSecurity';
import { SafetyOverview } from './components/SafetyOverview';
import { SettingsPanel } from './components/SettingsPanel';
import { NavigationSidebar } from './components/NavigationSidebar';
import { LoginPage } from './components/LoginPage';
import { TopBar } from './components/TopBar';
import { api } from './services/api';

type RoleType = 'Admin' | 'Member';
type AuthUser = {
  username?: string;
  email?: string | null;
  role?: string;
};

const VALID_COMMANDS = [
  { intent: "bật đèn", keywords: ["bật đèn", "mở đèn", "sáng đèn"] },
  { intent: "tắt đèn", keywords: ["tắt đèn", "tối đèn"] },
  { intent: "bật quạt", keywords: ["bật quạt", "mở quạt", "quay quạt"] },
  { intent: "tắt quạt", keywords: ["tắt quạt", "ngừng quạt"] },
];

// Thời gian hết hạn quyền voice sau khi quét mặt (5 phút)
const VOICE_GRANT_DURATION_MS = 5 * 60 * 1000;

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

function mapRole(role?: string): RoleType {
  return String(role || '').toLowerCase() === 'admin' ? 'Admin' : 'Member';
}

function mapUser(user?: AuthUser | null) {
  return {
    name: user?.username || user?.email || 'User',
    role: mapRole(user?.role),
  };
}


export default function App() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState({ name: 'User', role: 'Member' as RoleType });

  const [listening, setListening] = useState(false);
  const [speechText, setSpeechText] = useState("");
  const [detectedCommand, setDetectedCommand] = useState("");

  // --- Voice Authorization State ---
  const [voiceGranted, setVoiceGranted] = useState(false);
  const [voiceGrantedUser, setVoiceGrantedUser] = useState<string | null>(null);
  const [voiceGrantExpiry, setVoiceGrantExpiry] = useState<number | null>(null);

  // --- AI Suggestion State ---
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [aiReasons, setAiReasons] = useState<any>(null);
  const [aiEnvironment, setAiEnvironment] = useState<any>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);

  const handleAiSuggest = async () => {
    setAiSuggesting(true);
    try {
      const res = await api.getAISuggestions();
      setAiSuggestions(res.data.suggestions);
      setAiReasons(res.data.reasons);
      setAiEnvironment(res.data.currentEnvironment);
      setShowAiModal(true);
    } catch (err) {
      console.error('Lỗi lấy AI Suggestion:', err);
      alert('Không thể kết nối với AI Server.');
    } finally {
      setAiSuggesting(false);
    }
  };

  const handleApplyAi = async () => {
    setAiApplying(true);
    try {
      // 1. Lấy tất cả devices hiện tại
      const { data } = await api.getDevices();
      const allDevices = data.devices || [];

      // 2. Chạy lệnh control cho từng device tương ứng (Light & Fan)
      const promises = allDevices.map((dev: any) => {
        const type = String(dev.type).toLowerCase();
        const name = String(dev.d_name).toLowerCase();

        let action = null;
        if ((type.includes('light') || name.includes('light')) && aiSuggestions?.light) {
          action = aiSuggestions.light;
        } else if ((type.includes('fan') || name.includes('fan')) && aiSuggestions?.fan) {
          action = aiSuggestions.fan;
        }

        if (action && action !== String(dev.state).toLowerCase()) {
          return api.controlDevice(dev.device_id, { action });
        }
        return Promise.resolve();
      });

      await Promise.all(promises);
      alert('Đã áp dụng thành công các gợi ý từ AI!');
      setShowAiModal(false);
      // Gửi tín hiệu để các Component tự động fetch lại dữ liệu mà không cần reload trang
      window.dispatchEvent(new Event('refresh_devices'));
    } catch (err) {
      console.error('Lỗi áp dụng AI Suggestion:', err);
      alert('Có lỗi xảy ra khi áp dụng cấu hình AI.');
    } finally {
      setAiApplying(false);
    }
  };

  const handleLogin = (loggedInUser?: AuthUser) => {
    setUser(mapUser(loggedInUser));
    setIsLoggedIn(true);
  };

  // Khôi phục session khi reload trang
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const bootstrapUser = async () => {
      try {
        const response = await api.getCurrentUser();
        setUser(mapUser(response.data?.user));
        setIsLoggedIn(true);
      } catch (error) {
        console.error('Failed to restore user session:', error);
        localStorage.removeItem('authToken');
      }
    };

    bootstrapUser();
  }, []);

  // --- WebSocket: lắng nghe sự kiện từ Backend ---
  useEffect(() => {
    if (!isLoggedIn) return;

    const ws = new WebSocket('ws://localhost:3001');

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'VOICE_GRANTED') {
          setVoiceGranted(true);
          setVoiceGrantedUser(msg.data.user_class);
          setVoiceGrantExpiry(Date.now() + VOICE_GRANT_DURATION_MS);
        } else if (msg.type === 'DEVICE_ACTION') {
          window.dispatchEvent(new Event('refresh_devices'));
        }
      } catch (_) { }
    };

    return () => ws.close();
  }, [isLoggedIn]);

  // --- Timer: tự động thu hồi quyền voice sau 5 phút ---
  useEffect(() => {
    if (!voiceGrantExpiry) return;

    const remaining = voiceGrantExpiry - Date.now();
    if (remaining <= 0) {
      setVoiceGranted(false);
      setVoiceGrantedUser(null);
      setVoiceGrantExpiry(null);
      return;
    }

    const timer = setTimeout(() => {
      setVoiceGranted(false);
      setVoiceGrantedUser(null);
      setVoiceGrantExpiry(null);
      setListening(false);
    }, remaining);

    return () => clearTimeout(timer);
  }, [voiceGrantExpiry]);

  // --- Speech Recognition ---
  useEffect(() => {
    if (!SpeechRecognition) return;
    if (!voiceGranted) return; // Không cho chạy nếu chưa được cấp quyền

    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = false;

    if (listening) {
      setSpeechText("");
      setDetectedCommand("");
      recognition.start();
    } else {
      recognition.stop();
    }

    recognition.onresult = (event: any) => {
      let transcript = event.results[0][0].transcript.toLowerCase();
      transcript = transcript.replace(/[.,?!]/g, '').trim();
      setSpeechText(transcript);

      let matchedIntent: string | null = null;
      let matchedWord = "";

      for (const cmd of VALID_COMMANDS) {
        const found = cmd.keywords.find(kw => transcript.includes(kw));
        if (found) {
          matchedIntent = cmd.intent;
          matchedWord = found;
          break;
        }
      }

      if (matchedIntent) {
        setDetectedCommand(`Lệnh hợp lệ: [${matchedWord}]`);

        // Gửi text lệnh thẳng lên HuyGia/feeds/voice — YoloBoard xử lý phần còn lại
        api.voiceCommand(matchedIntent, voiceGrantedUser).catch(err => console.error('Voice command error:', err));
      } else {
        setDetectedCommand("Không có lệnh nào hợp lệ.");
      }

      setListening(false);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        setSpeechText("Không nghe thấy gì, vui lòng nói lại.");
      } else if (event.error === 'network') {
        setSpeechText("Lỗi mạng: Cần có internet để nhận diện.");
      } else {
        setSpeechText(`Lỗi micro: ${event.error}`);
      }
      setListening(false);
    };

    return () => recognition.stop();
  }, [listening, voiceGranted]);

  // Tự xóa kết quả nhận diện sau 4 giây
  useEffect(() => {
    if (!listening && speechText !== "") {
      const timer = setTimeout(() => {
        setSpeechText("");
        setDetectedCommand("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [listening, speechText]);

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardOverview onNavigate={setActiveSection} />;
      case 'environment':
        return <EnvironmentDevices />;
      case 'access':
        return <AccessSecurity role={user.role} />;
      // case 'safety':
      //   return <SafetyOverview />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <DashboardOverview onNavigate={setActiveSection} />;
    }
  };

  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Tính thời gian còn lại của phiên voice (phút:giây)
  const voiceTimeLeft = voiceGrantExpiry ? Math.max(0, Math.ceil((voiceGrantExpiry - Date.now()) / 1000)) : 0;
  const voiceMinLeft = Math.floor(voiceTimeLeft / 60);
  const voiceSecLeft = voiceTimeLeft % 60;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <NavigationSidebar activeSection={activeSection} onSectionChange={setActiveSection} user={user} />
      <main className="flex-1 min-h-screen p-6 ml-64 relative">
        <div className="max-w-7xl mx-auto space-y-6">
          <TopBar
            name={user.name}
            role={user.role}
            listening={listening}
            voiceGranted={voiceGranted}
            onToggleListening={() => setListening((prev) => !prev)}
            onLogout={() => {
              localStorage.removeItem('authToken');
              setIsLoggedIn(false);
              setUser({ name: 'User', role: 'Member' });
              setVoiceGranted(false);
              setVoiceGrantedUser(null);
              setVoiceGrantExpiry(null);
            }}
          />
          {renderActiveSection()}
        </div>

        {/* --- Voice Status Badge --- */}
        {voiceGranted && voiceGrantedUser && (
          <div className="fixed bottom-24 left-6 z-30 flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
            <ShieldCheck className="h-4 w-4" />
            <span>Voice: {voiceGrantedUser}</span>
            <span className="ml-1 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-mono">
              {voiceMinLeft}:{String(voiceSecLeft).padStart(2, '0')}
            </span>
          </div>
        )}

        {/* --- Speech Result Popup --- */}
        {(listening || speechText) && (
          <div className="fixed bottom-24 right-6 z-30 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 animate-in slide-in-from-bottom-4 fade-in duration-300">
            {!listening && (
              <button
                onClick={() => { setSpeechText(""); setDetectedCommand(""); }}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-full ${listening ? 'bg-red-100 text-red-500 animate-pulse' : 'bg-blue-100 text-[#0033CC]'}`}>
                <Mic className="w-5 h-5" />
              </div>
              <span className="font-semibold text-slate-800 text-base">
                {listening ? 'Hệ thống đang nghe...' : 'Kết quả nhận diện'}
              </span>
            </div>

            {speechText && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-3">
                <p className="text-sm text-slate-600 italic">"{speechText}"</p>
              </div>
            )}

            {detectedCommand && (
              <div className={`px-3 py-2 rounded-lg text-sm font-semibold text-center border ${detectedCommand.includes('hợp lệ')
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}>
                {detectedCommand}
              </div>
            )}
          </div>
        )}

        {/* --- AI Suggestion Modal --- */}
        {showAiModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-300" />
                    AI Smart Suggestion
                  </h3>
                  <p className="text-indigo-100 mt-1 text-sm">Dựa trên môi trường hiện tại của nhà bạn</p>
                </div>
                <button onClick={() => setShowAiModal(false)} className="text-white/70 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <span className="text-slate-500 block mb-1">Nhiệt độ</span>
                    <span className="font-bold text-slate-800">{aiEnvironment?.temperature?.toFixed(1) || '--'}°C</span>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <span className="text-slate-500 block mb-1">Độ sáng</span>
                    <span className="font-bold text-slate-800">{aiEnvironment?.brightness?.toFixed(0) || '--'} Lux</span>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <h4 className="font-semibold text-slate-800 border-b pb-2">Hệ thống AI khuyên bạn:</h4>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center text-yellow-600">
                        <Lightbulb className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-700">Hệ thống Đèn</span>
                        <span className="text-xs text-slate-500 italic mt-0.5 leading-relaxed">
                          {aiReasons?.light || "Theo thói quen học được"}
                        </span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase shrink-0 ml-3 ${aiSuggestions?.light === 'turn_on' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {aiSuggestions?.light === 'turn_on' ? 'Nên Bật' : 'Nên Tắt'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                        <Wind className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-700">Hệ thống Quạt</span>
                        <span className="text-xs text-slate-500 italic mt-0.5 leading-relaxed">
                          {aiReasons?.fan || "Theo thói quen học được"}
                        </span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${aiSuggestions?.fan === 'turn_on' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {aiSuggestions?.fan === 'turn_on' ? 'Nên Bật' : 'Nên Tắt'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setShowAiModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors">
                    Để sau
                  </button>
                  <button onClick={handleApplyAi} disabled={aiApplying} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors flex justify-center items-center gap-2 disabled:opacity-70 shadow-md">
                    {aiApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Áp dụng ngay
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- Nút AI Suggestion (Kế bên nút Mic) --- */}
        <button
          type="button"
          aria-label="AI Suggestion"
          title="Xin Gợi Ý Từ AI"
          disabled={aiSuggesting}
          className="fixed bottom-24 right-6 z-20 inline-flex h-14 w-14 items-center justify-center rounded-full text-white transition-all shadow-lg bg-indigo-600 hover:scale-105 hover:bg-indigo-700 hover:shadow-indigo-500/30"
          onClick={handleAiSuggest}
        >
          {aiSuggesting ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6" />}
        </button>

        {/* --- Nút Mic (Global, lock khi chưa xác thực khuôn mặt) --- */}
        <button
          type="button"
          aria-label="Voice control"
          disabled={!voiceGranted}
          title={!voiceGranted ? 'Cần quét mặt tại trang Security trước' : `Voice Control (${voiceGrantedUser})`}
          className={`fixed bottom-6 right-6 z-20 inline-flex h-14 w-14 items-center justify-center rounded-full text-white transition-all shadow-lg ${!voiceGranted
              ? 'bg-slate-400 cursor-not-allowed opacity-50'
              : listening
                ? 'animate-pulse bg-red-500 scale-110'
                : 'bg-[#0033CC] hover:scale-105'
            }`}
          onClick={() => voiceGranted && setListening((prev) => !prev)}
        >
          {voiceGranted ? <Mic className="h-6 w-6" /> : <ShieldOff className="h-6 w-6" />}
        </button>
      </main>
    </div>
  );
}


