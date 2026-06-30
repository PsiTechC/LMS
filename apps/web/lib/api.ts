export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("xa_token");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(json?.error?.message || "Request failed");
  }
  return json;
}

export const api = {
  get:    <T>(path: string)                    => request<T>(path),
  post:   <T>(path: string, body: unknown)     => request<T>(path, { method: "POST",  body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)     => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string)                    => request<T>(path, { method: "DELETE" }),
};

export interface ApiResponse<T> {
  data: T;
  meta?: { page: number; per_page: number; total: number };
  error: null | { code: string; message: string; field?: string };
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: "superadmin" | "program_manager" | "faculty" | "participant";
  avatar_url: string | null;
  org_id: string | null;
}

export interface LoginResponse {
  access_token: string;
  user: UserDTO;
}

export interface OrgResponse {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  seats: number;
  industry?: string;
  size?: string;
}
