"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, ApiResponse, LoginResponse, UserDTO } from "./api";

interface RegisterResult {
  message: string;
  email: string;
}

interface AuthState {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  otpLogin: (email: string, otp: string) => Promise<void>;
  sendOtp: (email: string) => Promise<string>;
  register: (name: string, email: string, password: string, role: string) => Promise<RegisterResult>;
  logout: () => void;
  setUserFromVerify: (user: UserDTO) => void;
  // Patches fields on the current user in local state (e.g. avatar_url after
  // an upload) — lets any screen reflect a self-service profile change
  // immediately, without a full page reload or refetch.
  updateUser: (patch: Partial<UserDTO>) => void;
  // Re-fetches the full user record from /auth/me — used after an upload so
  // every consumer of useAuth().user (Sidebar, SettingsPage, etc.) picks up
  // the new avatar_url in one place.
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  otpLogin: async () => {},
  sendOtp: async () => "",
  register: async () => ({ message: "", email: "" }),
  logout: () => {},
  setUserFromVerify: () => {},
  updateUser: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("xa_token");
    if (!token) { setLoading(false); return; }

    api.get<ApiResponse<UserDTO>>("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => { localStorage.removeItem("xa_token"); })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<ApiResponse<LoginResponse>>("/auth/login", { email, password });
    const { access_token, user: u } = res.data;
    localStorage.setItem("xa_token", access_token);
    setUser(u);
  }

  // Developer OTP login: sign in with the fixed dev code or a sent code.
  async function otpLogin(email: string, otp: string) {
    const res = await api.post<ApiResponse<LoginResponse>>("/auth/otp-login", { email, otp });
    const { access_token, user: u } = res.data;
    localStorage.setItem("xa_token", access_token);
    setUser(u);
  }

  // Request an OTP email; returns the server's message.
  async function sendOtp(email: string): Promise<string> {
    const res = await api.post<ApiResponse<{ message: string }>>("/auth/send-otp", { email });
    return res.data.message;
  }

  async function register(name: string, email: string, password: string, role: string): Promise<RegisterResult> {
    const res = await api.post<ApiResponse<RegisterResult>>("/auth/register", { name, email, password, role });
    return res.data;
  }

  function logout() {
    localStorage.removeItem("xa_token");
    setUser(null);
  }

  function setUserFromVerify(u: UserDTO) {
    setUser(u);
  }

  function updateUser(patch: Partial<UserDTO>) {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function refreshUser() {
    try {
      const res = await api.get<ApiResponse<UserDTO>>("/auth/me");
      setUser(res.data);
    } catch {
      // non-fatal — keep whatever's in state (e.g. token expired mid-session,
      // the existing GET /auth/me effect above will handle logging out)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, otpLogin, sendOtp, register, logout, setUserFromVerify, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }

// hasRole checks a user's primary role OR any secondary persona granted via
// role_assignments (e.g. a faculty account also holding "coach"). Use this
// instead of `user.role === X` whenever a secondary persona should also
// satisfy the check — every existing `user.role === X` guard elsewhere in
// the app is unaffected and keeps checking the primary role only.
export function hasRole(user: UserDTO | null, role: UserDTO["role"]): boolean {
  return !!user && (user.role === role || !!user.secondary_roles?.includes(role));
}
