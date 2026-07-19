import axios, { type InternalAxiosRequestConfig } from 'axios';

let accessToken: string | null = null;
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

// Bridge p/ surfaçar 409 'locked' (escrita por não-detentor do lock) na UI
let onLocked: (() => void) | null = null;
export function setLockedHandler(fn: (() => void) | null) {
  onLocked = fn;
}

// Identidade única por separador/janela (não por utilizador) — distingue 2 janelas da mesma conta
export const clientId = crypto.randomUUID();

const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers['Authorization'] = `Bearer ${accessToken}`;
  config.headers['X-Client-Id'] = clientId;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 409 && error.response?.data?.error === 'locked') {
      onLocked?.();
      return Promise.reject(error);
    }
    if (error.response?.status !== 401 || original?._retry) {
      return Promise.reject(error);
    }
    if (original?.url?.includes('/auth/refresh') || original?.url?.includes('/auth/login')) {
      return Promise.reject(error);
    }
    original._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers['Authorization'] = `Bearer ${token}`;
        return apiClient(original);
      });
    }

    isRefreshing = true;
    try {
      const { data } = await apiClient.post('/auth/refresh', {});
      const newToken: string = data.accessToken;
      setAccessToken(newToken);
      failedQueue.forEach((q) => q.resolve(newToken));
      failedQueue = [];
      original.headers['Authorization'] = `Bearer ${newToken}`;
      return apiClient(original);
    } catch (refreshError) {
      failedQueue.forEach((q) => q.reject(refreshError));
      failedQueue = [];
      setAccessToken(null);
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
