import { api, ApiResponse } from "./api";

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

  updateMe: (body: { name?: string; mobile_number?: string; about?: string; avatar_url?: string }) =>
    api.patch<ApiResponse<ProfileResponse>>("/users/me", body),

  changePassword: (body: { current_password: string; new_password: string }) =>
    api.post<ApiResponse<{ message: string }>>("/users/me/change-password", body),

  getPrefs: () =>
    api.get<ApiResponse<AllPrefs>>("/users/me/prefs"),

  updateNotifPrefs: (body: NotificationPrefs) =>
    api.patch<ApiResponse<NotificationPrefs>>("/users/me/prefs/notifications", body),

  updateAppearancePrefs: (body: AppearancePrefs) =>
    api.patch<ApiResponse<AppearancePrefs>>("/users/me/prefs/appearance", body),
};
