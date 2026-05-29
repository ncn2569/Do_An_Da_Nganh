import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Router, Thermometer, Lock, Lightbulb, Camera,
  Bot, Droplets, Speaker, ShieldAlert, Battery,
  BatteryFull, BatteryLow, Wifi, WifiOff, Power,
  Wind, ChefHat, Bed, Briefcase, ChevronLeft, Settings, Home, Plus
} from 'lucide-react';
import { api } from '../services/api';

type DeviceApiRecord = {
  device_id: string;
  d_name: string;
  type: string;
  state: string;
  r_id?: string | null;
};

type RoomApiRecord = {
  r_id: string;
  name: string;
  room_type: string;
  u_id?: string | null;
};

type RoomReadingRecord = {
  r_id?: string | null;
  temp?: number | null;
  bright?: number | null;
  humidity?: number | null;
  gas_level?: number | null;
  rooms?: {
    r_id: string;
    name: string;
    room_type: string;
  } | null;
};

type ConnectedDeviceCard = {
  key: string;
  id?: string;
  name: string;
  type: string;
  status: string;
  battery: number | null;
  icon: React.ComponentType<{ className?: string }>;
};

type RoomDeviceCard = {
  key: string;
  id?: string;
  name: string;
  type: string;
  icon: React.ComponentType<{ className?: string }>;
  roomId?: string | null;
};

type RoomCard = {
  key: string;
  name: string;
  roomType: string;
  icon: React.ComponentType<{ className?: string }>;
  lights: number;
  temp: string;
  occupied: boolean;
  devices: RoomDeviceCard[];
};

const fallbackConnectedDevices: ConnectedDeviceCard[] = [
  { key: 'Living Room Hub', name: 'Living Room Hub', type: 'Hub', status: 'Online', battery: null, icon: Router },
  { key: 'Smart Thermostat', name: 'Smart Thermostat', type: 'Climate', status: 'Online', battery: 85, icon: Thermometer },
  { key: 'Front Door Lock', name: 'Front Door Lock', type: 'Security', status: 'Online', battery: 67, icon: Lock },
  { key: 'Kitchen Lights', name: 'Kitchen Lights', type: 'Lighting', status: 'Online', battery: null, icon: Lightbulb },
  { key: 'Bedroom Camera', name: 'Bedroom Camera', type: 'Security', status: 'Offline', battery: 23, icon: Camera },
  { key: 'Robot Vacuum', name: 'Robot Vacuum', type: 'Appliance', status: 'Charging', battery: 100, icon: Bot },
  { key: 'Garden Sprinkler', name: 'Garden Sprinkler', type: 'Outdoor', status: 'Online', battery: 45, icon: Droplets },
  { key: 'Smart Speaker', name: 'Smart Speaker', type: 'Entertainment', status: 'Online', battery: null, icon: Speaker },
  { key: 'Smoke Detector', name: 'Smoke Detector', type: 'Security', status: 'Online', battery: 92, icon: ShieldAlert },
];

const roomIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  living: Home,
  living_room: Home,
  kitchen: ChefHat,
  bedroom: Bed,
  office: Briefcase,
};

const deviceIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  hub: Router,
  climate: Thermometer,
  thermostat: Thermometer,
  lock: Lock,
  lighting: Lightbulb,
  light: Lightbulb,
  camera: Camera,
  appliance: Power,
  robot: Bot,
  vacuum: Bot,
  outdoor: Droplets,
  sprinkler: Droplets,
  speaker: Speaker,
  entertainment: Speaker,
  security: ShieldAlert,
  fan: Wind,
};

const roomTypeOptions = [
  { value: 'living_room', label: 'Living Room' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'office', label: 'Office' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'custom', label: 'Custom' },
];

function getBatteryIcon(level: number | null) {
  if (level === null) return <Power className="h-4 w-4 text-slate-400" />;
  if (level > 80) return <BatteryFull className="h-4 w-4 text-emerald-500" />;
  if (level < 30) return <BatteryLow className="h-4 w-4 text-red-500" />;
  return <Battery className="h-4 w-4 text-slate-500" />;
}

function getDeviceIcon(type: string, name: string) {
  const candidates = [String(type || '').toLowerCase(), String(name || '').toLowerCase()];

  for (const candidate of candidates) {
    for (const [key, Icon] of Object.entries(deviceIconMap)) {
      if (candidate.includes(key)) {
        return Icon;
      }
    }
  }

  return Power;
}

function getRoomIcon(roomType?: string | null, roomName?: string | null) {
  const keys = [
    String(roomType || '').toLowerCase().replace(/\s+/g, '_'),
    String(roomName || '').toLowerCase().replace(/\s+/g, '_'),
  ];

  for (const key of keys) {
    if (roomIconMap[key]) {
      return roomIconMap[key];
    }
  }

  return Home;
}

function formatRoomType(roomType: string) {
  const normalized = String(roomType || '').replace(/_/g, ' ').trim();
  if (!normalized) {
    return 'Custom';
  }
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStatus(state: string) {
  const normalized = String(state || '').toLowerCase();
  if (normalized === 'on' || normalized === 'online' || normalized === 'active') return 'Online';
  if (normalized === 'off' || normalized === 'offline' || normalized === 'inactive') return 'Offline';
  if (normalized === 'charging') return 'Charging';
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Offline';
}

function isSwitchOn(state: string) {
  return ['on', 'online', 'active', 'charging', 'open', 'unlocked'].includes(String(state || '').toLowerCase());
}

function formatTemperature(temp?: number | null) {
  if (typeof temp !== 'number') {
    return 'N/A';
  }

  return `${temp.toFixed(1)}°C`;
}

export function EnvironmentDevices() {
  const [activeRoomDetail, setActiveRoomDetail] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceApiRecord[]>([]);
  const [roomsData, setRoomsData] = useState<RoomApiRecord[]>([]);
  const [roomReadings, setRoomReadings] = useState<RoomReadingRecord[]>([]);
  const [roomDeviceStates, setRoomDeviceStates] = useState<Record<string, Record<string, boolean>>>({});
  const [loadingDevices, setLoadingDevices] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('living_room');
  const [selectedAssignDeviceId, setSelectedAssignDeviceId] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [devicesResponse, roomsResponse, roomReadingsResponse] = await Promise.all([
        api.getDevices(),
        api.getEnvironmentRooms(),
        api.getEnvironmentRoomsLatest(),
      ]);

      const fetchedDevices = devicesResponse.data?.devices || [];
      const fetchedRooms = roomsResponse.data?.data || [];
      const fetchedRoomReadings = roomReadingsResponse.data?.data || [];

      setDevices(fetchedDevices);
      setRoomsData(fetchedRooms);
      setRoomReadings(fetchedRoomReadings);

      const groupedStates = fetchedDevices.reduce((acc: Record<string, Record<string, boolean>>, device: DeviceApiRecord) => {
        const roomKey = device.r_id || '__unassigned__';
        if (!acc[roomKey]) {
          acc[roomKey] = {};
        }
        acc[roomKey][device.device_id] = isSwitchOn(device.state);
        return acc;
      }, {});

      setRoomDeviceStates(groupedStates);
    } catch (error) {
      console.error('Failed to fetch device control data:', error);
      setErrorMessage('Failed to load rooms and devices from the backend.');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lắng nghe tín hiệu reload từ AI Suggestion (App.tsx)
  useEffect(() => {
    const handleRefresh = () => fetchData();
    window.addEventListener('refresh_devices', handleRefresh);
    return () => window.removeEventListener('refresh_devices', handleRefresh);
  }, [fetchData]);


  const roomLookup = useMemo(() => (
    roomReadings.reduce((acc: Record<string, RoomReadingRecord>, item) => {
      if (item.rooms?.r_id) {
        acc[item.rooms.r_id] = item;
      }
      return acc;
    }, {})
  ), [roomReadings]);

  const connectedDevices = useMemo<ConnectedDeviceCard[]>(() => {
    if (devices.length === 0) {
      return fallbackConnectedDevices;
    }

    return devices.map((device) => ({
      key: device.device_id,
      id: device.device_id,
      name: device.d_name,
      type: device.type,
      status: formatStatus(device.state),
      battery: null,
      icon: getDeviceIcon(device.type, device.d_name),
    }));
  }, [devices]);

  const rooms = useMemo<RoomCard[]>(() => {
    const groupedDevices = devices.reduce((acc: Record<string, DeviceApiRecord[]>, device) => {
      const roomKey = device.r_id || '__unassigned__';
      if (!acc[roomKey]) {
        acc[roomKey] = [];
      }
      acc[roomKey].push(device);
      return acc;
    }, {});

    return roomsData.map((room) => {
      const roomDevices = groupedDevices[room.r_id] || [];
      const reading = roomLookup[room.r_id];

      return {
        key: room.r_id,
        name: room.name,
        roomType: room.room_type,
        icon: getRoomIcon(room.room_type, room.name),
        lights: roomDevices.filter((device) => (
          String(device.type).toLowerCase().includes('light') ||
          String(device.d_name).toLowerCase().includes('light')
        )).length,
        temp: formatTemperature(reading?.temp),
        occupied: roomDevices.some((device) => isSwitchOn(device.state)),
        devices: roomDevices.map((device) => ({
          key: device.device_id,
          id: device.device_id,
          name: device.d_name,
          type: device.type,
          icon: getDeviceIcon(device.type, device.d_name),
          roomId: device.r_id || null,
        })),
      };
    });
  }, [devices, roomLookup, roomsData]);

  const unassignedDevices = useMemo(() => (
    devices
      .filter((device) => !device.r_id)
      .map((device) => ({
        key: device.device_id,
        id: device.device_id,
        name: device.d_name,
        type: device.type,
        icon: getDeviceIcon(device.type, device.d_name),
        roomId: null,
      }))
  ), [devices]);

  const assignableDevices = useMemo(() => (
    devices.filter((device) => device.r_id !== activeRoomDetail)
  ), [devices, activeRoomDetail]);

  const activeRoom = rooms.find((room) => room.key === activeRoomDetail) || null;
  const ActiveRoomIcon = activeRoom?.icon || Home;

  const toggleRoomDevice = async (roomKey: string, device: RoomDeviceCard) => {
    const deviceKey = `${roomKey}-${device.key}`;
    const currentState = roomDeviceStates[roomKey]?.[device.key] ?? false;

    setRoomDeviceStates((prev) => ({
      ...prev,
      [roomKey]: {
        ...prev[roomKey],
        [device.key]: !currentState,
      },
    }));

    setLoadingDevices((prev) => new Set(prev).add(deviceKey));
    setErrorMessage(null);

    try {
      if (!device.id) {
        throw new Error('Device ID is missing');
      }

      const action = !currentState ? 'turn_on' : 'turn_off';
      await api.controlDevice(device.id, { action });
    } catch (error) {
      setRoomDeviceStates((prev) => ({
        ...prev,
        [roomKey]: {
          ...prev[roomKey],
          [device.key]: currentState,
        },
      }));

      const errorMsg = error instanceof Error ? error.message : 'Failed to control device';
      setErrorMessage(`${device.name}: ${errorMsg}`);
    } finally {
      setLoadingDevices((prev) => {
        const updated = new Set(prev);
        updated.delete(deviceKey);
        return updated;
      });
    }
  };

  const assignDeviceToRoom = async (deviceId: string, roomId: string | null) => {
    if (!deviceId) {
      return;
    }

    setErrorMessage(null);

    try {
      await api.updateDevice(deviceId, { r_id: roomId });
      await fetchData();
      setSelectedAssignDeviceId('');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to update device room';
      setErrorMessage(errorMsg);
    }
  };

  const createRoom = async () => {
    const roomName = newRoomName.trim();
    if (!roomName) {
      setErrorMessage('Room name is required.');
      return;
    }

    setSavingRoom(true);
    setErrorMessage(null);

    try {
      await api.createEnvironmentRoom({
        name: roomName,
        room_type: newRoomType === 'custom' ? 'custom' : newRoomType,
      });
      setNewRoomName('');
      setNewRoomType('living_room');
      setCreatingRoom(false);
      await fetchData();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to create room';
      setErrorMessage(errorMsg);
    } finally {
      setSavingRoom(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Device Control</h2>
          <p className="mt-1 text-sm text-slate-500">Manage connected devices, rooms, and assignments from the database.</p>
        </div>
        <Badge className="border-[#cbe0ff] bg-blue-50 px-4 py-1.5 text-sm font-medium text-[#0033CC] shadow-sm">
          <Wifi className="mr-2 inline-block h-4 w-4" />
          Connected Home
        </Badge>
      </div>

      <Card className="border-2 border-slate-300 shadow-md">
        <Tabs defaultValue="connected" className="w-full">
          <CardHeader className="rounded-t-xl border-b border-slate-100 bg-slate-50 pb-4">
            <TabsList className="grid h-14 w-full grid-cols-2 rounded-xl bg-slate-200/50 p-1.5">
              <TabsTrigger
                value="connected"
                className="rounded-lg py-2 text-base font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
                onClick={() => setActiveRoomDetail(null)}
              >
                Connected Devices
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="rounded-lg py-2 text-base font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Room Settings
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="p-6">
            <TabsContent value="connected" className="mt-0">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {connectedDevices.map((device) => {
                  const DeviceIcon = device.icon;
                  const isOnline = device.status === 'Online';
                  const isCharging = device.status === 'Charging';

                  return (
                    <div
                      key={device.key}
                      className="group flex flex-col justify-between rounded-xl border-2 border-slate-300 bg-white p-5 transition-all duration-200 hover:border-blue-400 hover:shadow-md"
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div className={`rounded-lg p-2.5 ${isOnline || isCharging ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                          <DeviceIcon className="h-6 w-6" />
                        </div>
                        <Badge
                          className={`flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium ${
                            isOnline
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : isCharging
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          {isOnline ? <Wifi className="h-3 w-3" /> : isCharging ? <Power className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                          {device.status}
                        </Badge>
                      </div>

                      <div>
                        <p className="text-base font-semibold text-slate-900 transition-colors group-hover:text-blue-700">{device.name}</p>
                        <p className="mb-4 text-xs font-medium text-slate-500">{device.type}</p>
                      </div>

                      <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
                        {getBatteryIcon(device.battery)}
                        <div className="flex-1">
                          {device.battery !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${device.battery > 30 ? 'bg-emerald-500' : 'bg-red-500'}`}
                                  style={{ width: `${device.battery}%` }}
                                />
                              </div>
                              <span className="w-8 text-xs font-medium text-slate-500">{device.battery}%</span>
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-slate-400">Direct power</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 space-y-6">
              {errorMessage && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}

              {!activeRoomDetail && (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Rooms From Database</h3>
                        <p className="text-sm text-slate-500">Room cards now come directly from the `rooms` table, even when a room has no devices.</p>
                      </div>
                      <Button type="button" className="gap-2" onClick={() => setCreatingRoom((prev) => !prev)}>
                        <Plus className="h-4 w-4" />
                        {creatingRoom ? 'Hide Form' : 'Add New Room'}
                      </Button>
                    </div>

                    {creatingRoom && (
                      <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="room-name">Room Name</Label>
                          <Input
                            id="room-name"
                            value={newRoomName}
                            onChange={(event) => setNewRoomName(event.target.value)}
                            placeholder="Example: Gia Bao Bedroom"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Room Type</Label>
                          <Select value={newRoomType} onValueChange={setNewRoomType}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select room type" />
                            </SelectTrigger>
                            <SelectContent>
                              {roomTypeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button type="button" className="w-full" onClick={createRoom} disabled={savingRoom}>
                            {savingRoom ? 'Saving...' : 'Create Room'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Unassigned Devices</h3>
                        <p className="text-sm text-slate-500">These devices are in the database but not currently mapped to any room.</p>
                      </div>
                      <Badge className="bg-slate-100 text-slate-700">{unassignedDevices.length}</Badge>
                    </div>
                    {unassignedDevices.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {unassignedDevices.map((device) => (
                          <Badge key={device.key} variant="outline" className="px-3 py-1 text-slate-700">
                            {device.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">All devices are currently assigned to rooms.</p>
                    )}
                  </div>

                  {rooms.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {rooms.map((room) => {
                        const RoomIcon = room.icon;
                        return (
                          <button
                            key={room.key}
                            onClick={() => setActiveRoomDetail(room.key)}
                            className="group flex flex-col justify-between rounded-2xl border-2 border-slate-300 bg-white p-6 text-left transition-all duration-200 hover:border-blue-500 hover:shadow-lg hover:ring-2 hover:ring-blue-100"
                          >
                            <div className="mb-6 flex w-full items-start justify-between">
                              <div className="rounded-xl bg-slate-50 p-3.5 text-slate-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
                                <RoomIcon className="h-8 w-8" />
                              </div>
                              <Badge className={`px-2 py-0.5 text-[10px] uppercase tracking-wider ${room.occupied ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                {room.occupied ? 'Occupied' : 'Empty'}
                              </Badge>
                            </div>

                            <div>
                              <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-700">{room.name}</h3>
                              <p className="mt-1 text-sm text-slate-500">Room name: {room.name}</p>
                              <p className="mt-1 text-sm text-slate-500">Room type: {formatRoomType(room.roomType)}</p>
                              <p className="mt-1 text-sm text-slate-500">{room.devices.length} Connected Devices</p>
                            </div>

                            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Lightbulb className="h-4 w-4 text-amber-500" />
                                <span className="font-medium">{room.lights}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Thermometer className="h-4 w-4 text-rose-500" />
                                <span className="font-medium">{room.temp}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
                      <h3 className="text-lg font-semibold text-slate-900">No Rooms Found</h3>
                      <p className="mt-2 text-sm text-slate-500">
                        The backend did not return any rows from the `rooms` table yet.
                      </p>
                    </div>
                  )}
                </>
              )}

              {activeRoomDetail && activeRoom && (
                <div className="animate-in slide-in-from-bottom-4 fade-in space-y-6 duration-300">
                  <div className="flex items-center gap-4 border-b border-slate-200 pb-4">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-full hover:bg-slate-100"
                      onClick={() => setActiveRoomDetail(null)}
                    >
                      <ChevronLeft className="h-5 w-5 text-slate-600" />
                    </Button>
                    <div>
                      <h3 className="flex items-center gap-3 text-2xl font-bold text-slate-900">
                        <ActiveRoomIcon className="h-6 w-6 text-blue-600" />
                        {activeRoom.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">Room name: {activeRoom.name}</p>
                      <p className="mt-1 text-sm text-slate-500">Room type: {formatRoomType(activeRoom.roomType)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
                    <div className="space-y-2">
                      <Label>Assign Or Move A Device Into This Room</Label>
                      <Select value={selectedAssignDeviceId} onValueChange={setSelectedAssignDeviceId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a device" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableDevices.map((device) => (
                            <SelectItem key={device.device_id} value={device.device_id}>
                              {device.d_name} ({device.r_id ? 'Move from another room' : 'Currently unassigned'})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      onClick={() => assignDeviceToRoom(selectedAssignDeviceId, activeRoom.key)}
                      disabled={!selectedAssignDeviceId}
                    >
                      Assign To Room
                    </Button>
                  </div>

                  {activeRoom.devices.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {activeRoom.devices.map((device) => {
                        const DeviceIcon = device.icon;
                        const isOn = roomDeviceStates[activeRoom.key]?.[device.key] ?? false;
                        const deviceKey = `${activeRoom.key}-${device.key}`;
                        const isLoading = loadingDevices.has(deviceKey);

                        return (
                          <div
                            key={device.key}
                            className={`flex flex-col gap-4 rounded-xl border-2 p-5 transition-all duration-200 ${
                              isOn ? 'border-blue-300 bg-blue-50/50 shadow-sm' : 'border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-4">
                                <div className={`rounded-full p-3 transition-colors ${isOn ? 'bg-blue-100 text-blue-600 shadow-inner' : 'bg-slate-100 text-slate-400'}`}>
                                  <DeviceIcon className="h-6 w-6" />
                                </div>
                                <div>
                                  <p className={`text-lg font-semibold ${isOn ? 'text-slate-900' : 'text-slate-600'}`}>{device.name}</p>
                                  <p className="mt-0.5 text-sm text-slate-500">{device.type}</p>
                                </div>
                              </div>

                              <Switch
                                checked={isOn}
                                disabled={isLoading}
                                onCheckedChange={() => toggleRoomDevice(activeRoom.key, device)}
                                className="data-[state=checked]:bg-blue-600"
                              />
                            </div>

                            <div className="mt-2 flex items-center justify-between border-t border-slate-200/60 pt-4">
                              <Badge variant="outline" className={`${isOn ? 'border-none bg-blue-100 text-blue-700' : 'border-none bg-slate-100 text-slate-500'}`}>
                                {isLoading ? 'Processing...' : isOn ? 'Running' : 'Off'}
                              </Badge>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => assignDeviceToRoom(device.id || '', null)}
                                  disabled={!device.id}
                                >
                                  Unassign
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className={`gap-2 ${isOn ? 'bg-white text-blue-700 hover:bg-blue-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                  disabled={isLoading}
                                >
                                  <Settings className="h-4 w-4" />
                                  Configure
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
                      <h3 className="text-lg font-semibold text-slate-900">No Devices In This Room</h3>
                      <p className="mt-2 text-sm text-slate-500">
                        This room exists in the database. You can assign a device to it using the control above.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
