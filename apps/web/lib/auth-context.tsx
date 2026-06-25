"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, ApiResponse, LoginResponse, UserDTO } from "./api";

interface AuthState {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
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

  function logout() {
    localStorage.removeItem("xa_token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
