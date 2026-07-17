export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("xa_token");
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  // The envelope's error.code (e.g. "INVALID_TOKEN", "SESSION_ENDED") — several
  // distinct error conditions share the same HTTP status (e.g. 422), so callers
  // that need to branch on the specific reason should check this, not `status`.
  code?: string;
  constructor(message: string, status: number, data: unknown, code?: string) {
    super(message);
    this.status = status;
    this.data = data;
    this.code = code;
  }
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
    throw new ApiError(json?.error?.message || "Request failed", res.status, json?.data, json?.error?.code);
  }
  return json;
}

export const api = {
  get:    <T>(path: string)                    => request<T>(path),
  post:   <T>(path: string, body: unknown)     => request<T>(path, { method: "POST",  body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)     => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)     => request<T>(path, { method: "PUT",   body: JSON.stringify(body) }),
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
  role: "superadmin" | "superadmin_secondary" | "program_manager" | "faculty" | "coach" | "participant" | "participant_retailer";
  avatar_url: string | null;
  org_id: string | null;
  // Additional personas this user holds beyond `role` (e.g. a faculty account
  // also granted "coach"). UI-only — never used for authorization decisions,
  // which the backend always re-derives server-side.
  secondary_roles?: string[];
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
  // Billing/contract fields — consumed by the superadmin Billing page's
  // Organizations table; other existing consumers of this same DTO (the
  // Organizations page) simply don't render these.
  program_manager_name?: string; // "" / absent when no Primary PM assigned yet
  plan_start_date?: string;      // YYYY-MM-DD
  plan_end_date?: string;        // YYYY-MM-DD
  billing_note?: string;
}
