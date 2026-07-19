import apiClient from './client';
import type { ShareUser } from './ebooks-api';

export interface AuthUser {
  id: number;
  email: string;
  role: 'admin' | 'user';
  created_at?: string;
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/login', { email, password }),

  logout: () =>
    apiClient.post('/auth/logout'),

  refresh: () =>
    apiClient.post<AuthResponse>('/auth/refresh', {}, { withCredentials: true }),

  me: () =>
    apiClient.get<{ data: AuthUser }>('/auth/me'),

  listUsers: () =>
    apiClient.get<{ data: AuthUser[] }>('/auth/users'),

  // Lista leve (id+email), sem gate de admin — usada pelo modal de partilha.
  listBasicUsers: () =>
    apiClient.get<{ data: ShareUser[] }>('/users'),

  createUser: (email: string, password: string, role: 'admin' | 'user') =>
    apiClient.post<{ data: AuthUser }>('/auth/users', { email, password, role }),

  deleteUser: (id: number) =>
    apiClient.delete(`/auth/users/${id}`),

  updateUser: (id: number, data: { email?: string; password?: string; role?: 'admin' | 'user' }) =>
    apiClient.put<{ data: AuthUser }>(`/auth/users/${id}`, data),
};
