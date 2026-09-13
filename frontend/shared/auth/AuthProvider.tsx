import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiClient, ApiError } from '../services/api-client';
export interface User { id: string; username: string; display_name?: string }
type Status = 'loading' | 'authenticated' | 'unauthenticated' | 'error';
interface Auth { user: User | null; status: Status; api: ApiClient; login: (data: Credentials, register?: boolean) => Promise<void>; logout: () => Promise<void>; retry: () => void }
export interface Credentials { username: string; password: string; display_name?: string }
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => new ApiClient({ baseUrl: window.__API_URL__ || '' }), []);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  function clear() {
    api.clearAuthToken();
    for (const key of ['cd_access_token', 'cd_refresh_token', 'cd_user', 'cd_workspace_id']) localStorage.removeItem(key);
    setUser(null); setStatus('unauthenticated');
  }
  function persist() {
    localStorage.setItem('cd_access_token', api.getAuthToken() || '');
    localStorage.setItem('cd_refresh_token', api.getRefreshToken() || '');
  }
  useEffect(() => {
    let active = true;
    api.onUnauthorized = undefined;
    setStatus('loading');
    async function restore() {
      api.setAuthToken(localStorage.getItem('cd_access_token'));
      api.setRefreshToken(localStorage.getItem('cd_refresh_token'));
      if (!api.getAuthToken() && !api.getRefreshToken()) { if (active) clear(); return; }
      try {
        let profile: { user: User };
        try { profile = await api.request('/api/auth/me'); }
        catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) throw error;
          if (!api.getRefreshToken()) { if (active) clear(); return; }
          try { await api.refreshTokens(); persist(); }
          catch { if (active) clear(); return; }
          profile = await api.request('/api/auth/me');
        }
        if (active) { setUser(profile.user); setStatus('authenticated'); }
      } catch (error) {
        if (active) {
          if (error instanceof ApiError && error.status === 401) clear();
          else setStatus('error');
        }
      } finally { if (active) api.onUnauthorized = clear; }
    }
    void restore();
    return () => { active = false; api.onUnauthorized = undefined; };
  }, [api, attempt]);
  async function login(credentials: Credentials, register = false) {
    const result = register ? await api.register(credentials) : await api.login(credentials);
    if (!result.access_token || !result.user) throw new Error('Session missing');
    persist(); setUser(result.user); setStatus('authenticated'); api.onUnauthorized = clear;
  }
  async function logout() { try { await api.logout(); } finally { clear(); } }
  return <AuthContext.Provider value={{ user, status, api, login, logout, retry: () => setAttempt(n => n + 1) }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('Missing AuthProvider'); return value; }
declare global { interface Window { __API_URL__?: string } }
