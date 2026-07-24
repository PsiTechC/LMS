import type { ApiResponse } from '../types/api';

/**
 * Centralized API client.
 *
 * Base URL comes from `EXPO_PUBLIC_API_URL` (apps/mobile/.env), the same
 * convention already documented in the repo root `.env.example` — never
 * hardcode a host in a screen. Expo inlines `EXPO_PUBLIC_*` vars at build
 * time, so no expo-constants indirection is needed for this value.
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

// In-memory bearer token, set by AuthProvider on restore/login/logout.
// Kept in memory (not read from secure storage per-request) because
// SecureStore access is async and every request needing a synchronous
// header would otherwise have to await it twice.
let currentToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentToken = token;
}

// Called by AuthProvider so a 401 on an authenticated request can trigger a
// single, centralized logout instead of every screen handling it ad hoc.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export type ApiErrorKind = 'network' | 'http';

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  field?: string;

  constructor(message: string, opts: { kind: ApiErrorKind; status?: number; code?: string; field?: string }) {
    super(message);
    this.kind = opts.kind;
    this.status = opts.status;
    this.code = opts.code;
    this.field = opts.field;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  // Set true for endpoints that don't require a session (login, register,
  // etc.) so a stray 401 there never triggers the global logout handler.
  skipAuthRedirect?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const hadToken = !!currentToken;
  if (currentToken) headers.Authorization = `Bearer ${currentToken}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    // Network failure (offline, DNS, server unreachable, timeout) — no HTTP
    // response was ever received. Never log request bodies/tokens here.
    throw new ApiError('Network request failed. Check your connection and try again.', { kind: 'network' });
  }

  const text = await res.text();
  const json: ApiResponse<T> | null = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401 && hadToken && !opts.skipAuthRedirect && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(json?.error?.message || 'Request failed', {
      kind: 'http',
      status: res.status,
      code: json?.error?.code,
      field: json?.error?.field,
    });
  }

  // json is guaranteed for 2xx responses in this API's contract.
  return (json as ApiResponse<T>).data;
}

export const apiClient = {
  get: <T>(path: string, opts: RequestOptions = {}) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts: RequestOptions = {}) => request<T>(path, { ...opts, method: 'DELETE' }),
};
