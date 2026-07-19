import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, type AuthUser } from '../api/auth-api';
import { setAccessToken } from '../api/client';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setAuth = useCallback((token: string, authUser: AuthUser) => {
    setAccessToken(token);
    setUser(authUser);
  }, []);

  // Refresh tokens are single-use (rotated server-side). React StrictMode double-invokes
  // this effect in dev, which would fire two concurrent refreshes and race the rotation,
  // killing the session on reload. Guard so the boot refresh runs exactly once.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    authApi.refresh()
      .then(({ data }) => setAuth(data.accessToken, data.user))
      .catch(() => { /* no session */ })
      .finally(() => setIsLoading(false));
  }, [setAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    setAuth(data.accessToken, data.user);
  }, [setAuth]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
