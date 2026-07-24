import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { authApi } from '../api/auth';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import { permissionsApi } from '../api/permissions';
import { clearStoredToken, getStoredToken, setStoredToken } from './secureStorage';
import type { UserDTO } from '../types/api';

export type AuthStatus = 'restoring' | 'signed-out' | 'signed-in';

// Resolved GET /me/permissions result, reshaped for cheap lookups
// (Set instead of array) — same fetch/shape web's Sidebar.tsx uses for nav
// gating. `null` = not loaded yet or the fetch failed; every call site must
// fail-open (never hide/lock a destination) on null, exactly like web's
// isLocked comment documents, so a slow/broken permissions call can never
// strand a legitimate user.
export interface EffectivePermissions {
  full: boolean;
  keys: Set<string>;
  isPrimaryPM: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  user: UserDTO | null;
  permissions: EffectivePermissions | null;
  // Rejects with ApiError (kind: 'network' | 'http') — the login screen owns
  // presenting the message, this context never swallows it.
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Patches the in-memory user after a profile edit succeeds server-side —
  // never a local-only optimistic write, callers pass the server's response.
  updateUser: (patch: Partial<UserDTO>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<UserDTO | null>(null);
  const [permissions, setPermissions] = useState<EffectivePermissions | null>(null);
  // Guards against a restore-in-flight 401 firing logout twice.
  const loggingOutRef = useRef(false);

  // Best-effort — a failed/slow fetch just leaves `permissions` null, which
  // every nav-gating call site treats as fail-open (see EffectivePermissions
  // doc above), never as "hide everything".
  const loadPermissions = useCallback(async () => {
    try {
      const res = await permissionsApi.my();
      setPermissions({ full: res.full, keys: new Set(res.permissions), isPrimaryPM: res.is_primary_pm });
    } catch {
      setPermissions(null);
    }
  }, []);

  const logout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      await clearStoredToken();
    } finally {
      setAuthToken(null);
      setUser(null);
      setPermissions(null);
      setStatus('signed-out');
      loggingOutRef.current = false;
    }
  }, []);

  // Register once: any authenticated request that comes back 401 (expired
  // or invalid token — this backend has no refresh-token endpoint, see
  // JWT_EXPIRY in .env.example) routes through the same logout path.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // App launch: restore session from secure storage, then validate it
  // against the real backend (GET /auth/me) rather than trusting a stale
  // token blindly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getStoredToken();
      if (!token) {
        if (!cancelled) setStatus('signed-out');
        return;
      }
      setAuthToken(token);
      try {
        const me = await authApi.me();
        if (!cancelled) {
          setUser(me);
          setStatus('signed-in');
          void loadPermissions();
        }
      } catch {
        // Expired/invalid token, or offline on first launch — fail closed to
        // the login screen rather than assuming signed-in.
        if (!cancelled) {
          await clearStoredToken();
          setAuthToken(null);
          setStatus('signed-out');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPermissions]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    await setStoredToken(res.access_token);
    setAuthToken(res.access_token);
    setUser(res.user);
    setStatus('signed-in');
    void loadPermissions();
  }, [loadPermissions]);

  const updateUser = useCallback((patch: Partial<UserDTO>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, permissions, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
