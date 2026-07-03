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
  register: (name: string, email: string, password: string, role: string) => Promise<RegisterResult>;
  logout: () => void;
  setUserFromVerify: (user: UserDTO) => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => ({ message: "", email: "" }),
  logout: () => {},
  setUserFromVerify: () => {},
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

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUserFromVerify }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
