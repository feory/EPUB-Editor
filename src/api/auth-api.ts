import apiClient from './client';
import type { ShareUser } from './ebooks-api';

export interface AuthUser {
  id: number;
  email: string;
  role: 'admin' | 'user';
  first_name?: string | null;
  last_name?: string | null;
  name: string;               // "Nome Apelido", ou o email se não houver nome
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

  createUser: (email: string, password: string, role: 'admin' | 'user', firstName = '', lastName = '') =>
    apiClient.post<{ data: AuthUser }>('/auth/users', { email, password, role, firstName, lastName }),

  deleteUser: (id: number) =>
    apiClient.delete(`/auth/users/${id}`),

  // O próprio utilizador. Devolve uma sessão nova (as outras terminam).
  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<AuthResponse>('/auth/password', { currentPassword, newPassword }),

  // O próprio utilizador define o nome (vazio = voltar a mostrar o email).
  updateProfile: (firstName: string, lastName: string) =>
    apiClient.put<{ data: AuthUser }>('/auth/profile', { firstName, lastName }),

  updateUser: (id: number, data: { email?: string; password?: string; role?: 'admin' | 'user'; firstName?: string; lastName?: string }) =>
    apiClient.put<{ data: AuthUser }>(`/auth/users/${id}`, data),
};
