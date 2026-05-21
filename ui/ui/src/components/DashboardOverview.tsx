import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Lightbulb,
  RefreshCw,
  Thermometer,
  Shield,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';

interface DashboardOverviewProps {
  onNavigate: (section: string) => void;
}

interface SnapshotMetric {
  value: number | null;
  capturedAt?: string;
}

interface EnvironmentSnapshot {
  temperature?: SnapshotMetric | null;
  humidity?: SnapshotMetric | null;
  light?: SnapshotMetric | null;
  gas?: SnapshotMetric | null;
}

interface EnvironmentReading {
  en_id: string | number;
  temp: number | null;
  humidity: number | null;
  bright: number | null;
  gas_level: number | null;
  time_created: string;
}

interface TrendPoint {
  time: string;
  value: number;
}

// Interface mới cho lịch sử thiết bị
interface DeviceHistoryAction {
  id: string;
  deviceName: string;
  action: string;
  userName: string;
  timestamp: string;
}

type RangeOption = '1d' | '3d' | '1w' | '1m';

const rangeOptions: { key: RangeOption; label: string; days: number; limit: number }[] = [
  { key: '1d', label: '1 Day', days: 1, limit: 4000 },
  { key: '3d', label: '3 Days', days: 3, limit: 10000 },
  { key: '1w', label: '1 Week', days: 7, limit: 10000 },
  { key: '1m', label: '1 Month', days: 30, limit: 10000 },
];

function formatMetric(metric?: SnapshotMetric | null, suffix = '', digits = 1) {
  if (typeof metric?.value !== 'number') {
    return 'N/A';
  }
  return `${metric.value.toFixed(digits)}${suffix}`;
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

function formatShortTimeLabel(value: string) {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRangeLabel(value: string, range: RangeOption) {
  return range === '1d'
    ? formatShortTimeLabel(value)
    : new Date(value).toLocaleString([], {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function buildMetricTrend(
  history: EnvironmentReading[],
  metric: 'temp' | 'humidity' | 'gas_level' | 'bright',
  range: RangeOption,
) {
  const validReadings = history.filter((item) => typeof item[metric] === 'number');

  if (range === '1w' || range === '1m') {
    const buckets = validReadings.reduce((acc: Record<string, { sum: number; count: number; ts: string }>, item) => {
      const bucketKey = new Date(item.time_created).toISOString().slice(0, 10);
      if (!acc[bucketKey]) {
        acc[bucketKey] = { sum: 0, count: 0, ts: item.time_created };
      }
      acc[bucketKey].sum += item[metric] as number;
      acc[bucketKey].count += 1;
      return acc;
    }, {});

    return Object.entries(buckets).map(([key, bucket]) => ({
      time: formatDayLabel(bucket.ts),
      value: Number((bucket.sum / bucket.count).toFixed(2)),
    }));
  }

  return validReadings.map((item) => ({
    time: formatRangeLabel(item.time_created, range),
    value: item[metric] as number,
  }));
}

function buildAdaptiveDomain(
  data: TrendPoint[],
  options?: { minSpan?: number; paddingRatio?: number },
): [number, number] | ['auto', 'auto'] {
  if (data.length === 0) {
    return ['auto', 'auto'];
  }
  const values = data.map((item) => item.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;
  const minSpan = options?.minSpan ?? 1;
  const paddingRatio = options?.paddingRatio ?? 0.2;
  const effectiveRange = Math.max(range, minSpan);
  const padding = Math.max(effectiveRange * paddingRatio, minSpan * 0.15);
  const domainMin = Math.max(0, minValue - padding);
  const domainMax = maxValue + padding;

  return [Number(domainMin.toFixed(2)), Number(domainMax.toFixed(2))];
}

function buildFromDate(range: RangeOption) {
  const now = new Date();
  const option = rangeOptions.find((item) => item.key === range) || rangeOptions[0];
  now.setDate(now.getDate() - option.days);
  return now.toISOString();
}

function getRangeConfig(range: RangeOption) {
  return rangeOptions.find((item) => item.key === range) || rangeOptions[0];
}

export function DashboardOverview({ onNavigate }: DashboardOverviewProps) {
  const [snapshot, setSnapshot] = useState<EnvironmentSnapshot | null>(null);
  const [history, setHistory] = useState<EnvironmentReading[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<RangeOption>('1d');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // State mới cho Lịch sử điều khiển
  const [controlHistory, setControlHistory] = useState<DeviceHistoryAction[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const rangeConfig = getRangeConfig(selectedRange);
      const from = buildFromDate(selectedRange);
      const to = new Date().toISOString();
      
      const [snapshotResponse, historyResponse] = await Promise.all([
        api.getEnvironmentSnapshot(),
        api.getEnvironmentHistory({ limit: rangeConfig.limit, from, to }),
      ]);

      setSnapshot(snapshotResponse.data?.data || null);
      setHistory((historyResponse.data?.data || []).slice().reverse());
      setLastUpdatedAt(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch (error) {
      console.error('Failed to fetch environment data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedRange]);

  // Hook lấy dữ liệu lịch sử thiết bị lần đầu
  useEffect(() => {
    const fetchDeviceHistory = async () => {
      try {
        // Cần đảm bảo hàm getGlobalDeviceHistory đã được khai báo ở src/services/api.ts
        // Nếu API backend chưa sẵn sàng, đoạn mã này có thể lỗi, bạn cứ catch lỗi ở dưới
        const res = await (api as any).getGlobalDeviceHistory?.({ limit: 10 });
        if (res?.data?.data) {
          const formattedHistory = res.data.data.map((item: any) => ({
            id: item.id || Math.random().toString(),
            deviceName: item.devices?.d_name || item.device_id,
            action: item.event?.action || 'UNKNOWN',
            userName: item.users?.username || item.users?.email || 'Hệ thống',
            timestamp: item.time,
          }));
          setControlHistory(formattedHistory);
        }
      } catch (error) {
        console.error("Chưa gọi được API lịch sử (Có thể backend chưa hỗ trợ):", error);
      }
    };
    fetchDeviceHistory();
  }, []);

  // Hook lắng nghe WebSocket để cập nhật danh sách Real-time
  useEffect(() => {
    const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
    wsRef.current = new WebSocket(WS_URL);

    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'DEVICE_ACTION') {
          const newAction = message.data;
          setControlHistory((prev) => [newAction, ...prev].slice(0, 10)); // Luôn giữ 10 dòng gần nhất
        }
      } catch (error) {
        console.error("Lỗi xử lý WS message", error);
      }
    };

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  useEffect(() => {
    fetchData();
    const intervalId = window.setInterval(fetchData, 30000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchData, refreshKey]);

  const currentTemp = snapshot?.temperature?.value;
  const isTempWarning = currentTemp !== undefined && currentTemp !== null && currentTemp > 40;

  const quickStats = [
    {
      label: 'Temperature',
      value: formatMetric(snapshot?.temperature, '°C'),
      icon: Thermometer,
      color: isTempWarning ? 'text-red-500' : 'text-[#0033CC]',
    },
    {
      label: 'Humidity',
      value: formatMetric(snapshot?.humidity, '%'),
      icon: Shield,
      color: 'text-[#0033CC]',
    },
    {
      label: 'Light',
      value: formatMetric(snapshot?.light, ' lux', 0),
      icon: Lightbulb,
      color: 'text-[#0033CC]',
    },
    {
      label: 'Gas',
      value: formatMetric(snapshot?.gas, ' ppm', 0),
      icon: Zap,
      color: 'text-[#0033CC]',
    },
  ];

  const temperatureTrendData = useMemo(() => buildMetricTrend(history, 'temp', selectedRange), [history, selectedRange]);
  const humidityTrendData = useMemo(() => buildMetricTrend(history, 'humidity', selectedRange), [history, selectedRange]);
  const gasTrendData = useMemo(() => buildMetricTrend(history, 'gas_level', selectedRange), [history, selectedRange]);
  const lightTrendData = useMemo(() => buildMetricTrend(history, 'bright', selectedRange), [history, selectedRange]);
  const temperatureDomain = buildAdaptiveDomain(temperatureTrendData, { minSpan: 1.5, paddingRatio: 0.18 });
  const humidityDomain = buildAdaptiveDomain(humidityTrendData, { minSpan: 4, paddingRatio: 0.18 });
  const gasDomain = buildAdaptiveDomain(gasTrendData, { minSpan: 20, paddingRatio: 0.15 });
  const lightDomain = buildAdaptiveDomain(lightTrendData, { minSpan: 30, paddingRatio: 0.15 });
  
  const trendDescription = selectedRange === '1w' || selectedRange === '1m'
    ? 'Daily averages in the selected range.'
    : 'All valid samples in the selected range.';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:items-center">
        <div>
          <h1 className="mb-2 text-3xl font-semibold text-slate-900">Overview</h1>
          <p className="text-sm text-slate-500">Quickly monitor your home status.</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {rangeOptions.map((option) => (
            <Button
              key={option.key}
              variant={selectedRange === option.key ? 'default' : 'outline'}
              className={selectedRange === option.key ? 'bg-[#0033CC] hover:bg-[#0029a3]' : ''}
              onClick={() => setSelectedRange(option.key)}
            >
              {option.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setRefreshKey((prev) => prev + 1)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="flex justify-start xl:justify-end">
          <Badge className="bg-slate-100 text-slate-700">
            {history.length > 0
              ? `Refresh every 30s${lastUpdatedAt ? ` · ${lastUpdatedAt}` : ''}`
              : 'Waiting for sensor data'}
          </Badge>
        </div>
      </div>

      {/* CẢNH BÁO NHIỆT ĐỘ */}
      {isTempWarning && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-sm flex items-start gap-3 animate-in slide-in-from-top-4 fade-in duration-300">
          <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
          <div>
            <h3 className="text-red-800 font-bold">Cảnh báo nhiệt độ cao!</h3>
            <p className="text-red-700 text-sm">
              Nhiệt độ hiện tại đang là <b>{currentTemp}°C</b>, vượt quá mức an toàn. Vui lòng kiểm tra ngay!
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {quickStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className={`cursor-pointer border-2 border-slate-300 transition-colors ${stat.label === 'Temperature' && isTempWarning ? 'bg-red-50 border-red-300' : 'hover:bg-slate-50'}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`mb-1 text-sm ${stat.label === 'Temperature' && isTempWarning ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{stat.label}</p>
                    <p className={`text-2xl font-semibold ${stat.label === 'Temperature' && isTempWarning ? 'text-red-700' : ''}`}>{stat.value}</p>
                  </div>
                  <Icon className={`h-8 w-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-2 border-slate-300">
          <CardHeader>
            <CardTitle>Temperature Trend</CardTitle>
            <p className="text-sm text-muted-foreground">{trendDescription}</p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={temperatureTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fb7185" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#fb7185" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} domain={temperatureDomain} tickCount={5} />
                  <Tooltip formatter={(value: number) => [`${value}°C`, 'Temperature']} />
                  <Area type="monotone" dataKey="value" stroke="#fb7185" fillOpacity={1} fill="url(#tempGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-slate-300">
          <CardHeader>
            <CardTitle>Humidity Trend</CardTitle>
            <p className="text-sm text-muted-foreground">{trendDescription}</p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={humidityTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="humidityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} domain={humidityDomain} tickCount={5} />
                  <Tooltip formatter={(value: number) => [`${value}% RH`, 'Humidity']} />
                  <Area type="monotone" dataKey="value" stroke="#38bdf8" fillOpacity={1} fill="url(#humidityGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-slate-300">
          <CardHeader>
            <CardTitle>Gas Levels Trend</CardTitle>
            <p className="text-sm text-muted-foreground">{trendDescription}</p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={gasTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gasGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} domain={gasDomain} tickCount={5} />
                  <Tooltip formatter={(value: number) => [`${value} ppm`, 'Gas Level']} />
                  <Area type="monotone" dataKey="value" stroke="#a78bfa" fillOpacity={1} fill="url(#gasGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-slate-300">
          <CardHeader>
            <CardTitle>Light Intensity Trend</CardTitle>
            <p className="text-sm text-muted-foreground">{trendDescription}</p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lightTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lightGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} domain={lightDomain} tickCount={5} />
                  <Tooltip formatter={(value: number) => [`${value} lux`, 'Light Intensity']} />
                  <Area type="monotone" dataKey="value" stroke="#fbbf24" fillOpacity={1} fill="url(#lightGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DANH SÁCH LỊCH SỬ THIẾT BỊ REAL-TIME */}
      <Card className="border-2 border-slate-300">
        <CardHeader>
          <CardTitle>Hoạt động trực tiếp</CardTitle>
          <p className="text-sm text-muted-foreground">Lịch sử tương tác với thiết bị.</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {controlHistory.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Chưa có hoạt động nào.</p>
            ) : (
              controlHistory.map((item, index) => {
                const isOn = ['on', 'turn_on', 'ON'].includes(String(item.action).toUpperCase());
                return (
                  <div key={item.id + index} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0 animate-in slide-in-from-top-2 fade-in duration-300">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${isOn ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-600'}`}>
                        <Lightbulb className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          <b>{item.userName}</b> vừa 
                          <span className={isOn ? 'text-green-600 font-bold ml-1' : 'text-slate-500 font-bold ml-1'}>
                            {isOn ? 'BẬT' : 'TẮT'}
                          </span> thiết bị <b>{item.deviceName}</b>
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(item.timestamp).toLocaleTimeString('vi-VN')} - {new Date(item.timestamp).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}