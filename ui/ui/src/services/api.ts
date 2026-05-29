/// <reference types="vite/client" />
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Thêm token vào header nếu có
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  // Auth
  login: (identifier: string, password: string) =>
    apiClient.post('/users/login', { identifier, password }),
  register: (data: any) =>
    apiClient.post('/users/register', {
      username: data?.username || data?.displayName || data?.fullName,
      displayName: data?.displayName || data?.fullName,
      email: data?.email,
      password: data?.password,
    }),
  getCurrentUser: () => apiClient.get('/users/me'),

  // Devices
  getDevices: () => apiClient.get('/devices'),
  getDevice: (id: string) => apiClient.get(`/devices/${id}`),
  updateDevice: (id: string, data: any) => apiClient.put(`/devices/${id}`, data),
  controlDevice: (id: string, action: any) =>
    apiClient.post(`/devices/${id}/control`, action),

  // Environment
  getEnvironment: () => apiClient.get('/environment'),
  getEnvironmentLatest: (params?: Record<string, any>) => apiClient.get('/environment/latest', { params }),
  getEnvironmentSnapshot: (params?: Record<string, any>) => apiClient.get('/environment/snapshot', { params }),
  getEnvironmentHistory: (params?: Record<string, any>) => apiClient.get('/environment/history', { params }),
  getEnvironmentRooms: (params?: Record<string, any>) => apiClient.get('/environment/rooms', { params }),
  createEnvironmentRoom: (data: any) => apiClient.post('/environment/rooms', data),
  getEnvironmentRoomsLatest: (params?: Record<string, any>) => apiClient.get('/environment/rooms/latest', { params }),
  
  // Users
  getUsers: () => apiClient.get('/users'),
  getUser: (id: string) => apiClient.get(`/users/${id}`),

  getGlobalDeviceHistory: (params?: Record<string, any>) =>
    apiClient.get('/devices/history/all', { params }),

  // Voice Control
  voiceCommand: (text: string) =>
    apiClient.post('/devices/voice-command', { text }),

  // AI Suggestion
  getAISuggestions: () => apiClient.get('/devices/ai-suggest'),
};

export default apiClient;
