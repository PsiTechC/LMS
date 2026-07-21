import { api, ApiResponse, BASE_URL } from "./api";

// The API server's origin (BASE_URL minus the trailing "/api/v1") - needed
// because avatar_url/logo_url come back from the backend as server-absolute
// paths (e.g. "/api/v1/users/me/avatar/:id/file"), same convention as
// content-api.ts's BASE.
const API_ORIGIN = BASE_URL.endsWith("/api/v1") ? BASE_URL.slice(0, -7) : BASE_URL;

export interface ProfileResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar_url: string | null;
  mobile_number: string;
  about: string;
  created_at: string;
}

export interface NotificationPrefs {
  email_notifications: boolean;
  push_notifications: boolean;
  sms_alerts: boolean;
  upcoming_deadlines: boolean;
  feedback_received: boolean;
  session_reminders: boolean;
  weekly_digest: boolean;
}

export interface AppearancePrefs {
  theme: "light" | "dark" | "auto";
  density: "compact" | "comfortable" | "spacious";
  language: string;
  date_format: string;
  timezone: string;
}

export interface AllPrefs {
  notifications: NotificationPrefs;
  appearance: AppearancePrefs;
}

export const profileApi = {
  getMe: () =>
    api.get<ApiResponse<ProfileResponse>>("/users/me"),

  // avatar_url is intentionally not accepted here - uploadAvatar() below is
  // the only validated write path for it (see api/internal/users/dto.go).
  updateMe: (body: { name?: string; mobile_number?: string; about?: string }) =>
    api.patch<ApiResponse<ProfileResponse>>("/users/me", body),

  changePassword: (body: { current_password: string; new_password: string }) =>
    api.post<ApiResponse<{ message: string }>>("/users/me/change-password", body),

  getPrefs: () =>
    api.get<ApiResponse<AllPrefs>>("/users/me/prefs"),

  updateNotifPrefs: (body: NotificationPrefs) =>
    api.patch<ApiResponse<NotificationPrefs>>("/users/me/prefs/notifications", body),

  updateAppearancePrefs: (body: AppearancePrefs) =>
    api.patch<ApiResponse<AppearancePrefs>>("/users/me/prefs/appearance", body),

  // Multipart upload - bypasses the JSON-only `api` helper, same pattern as
  // brandingApi.uploadLogo in brand-theme.tsx.
  async uploadAvatar(file: File): Promise<ApiResponse<{ avatar_url: string }>> {
    const form = new FormData();
    form.append("file", file);
    const token = typeof window !== "undefined" ? localStorage.getItem("xa_token") ?? "" : "";
    const res = await fetch(`${BASE_URL}/users/me/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
    return json as ApiResponse<{ avatar_url: string }>;
  },

  deleteAvatar: () =>
    api.delete<ApiResponse<null>>("/users/me/avatar"),

  // Turns a stored avatar_url (server-absolute path) into a directly
  // fetchable <img src> - appends the auth token as a query param, same
  // pattern as contentApi.fileUrl, since an <img> tag can't send an
  // Authorization header.
  avatarSrc(avatarUrl: string | null | undefined): string | null {
    if (!avatarUrl) return null;
    const token = typeof window !== "undefined" ? (localStorage.getItem("xa_token") ?? "") : "";
    const sep = avatarUrl.includes("?") ? "&" : "?";
    return `${API_ORIGIN}${avatarUrl}${sep}token=${encodeURIComponent(token)}`;
  },
};
