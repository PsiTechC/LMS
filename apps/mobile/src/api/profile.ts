import { apiClient } from './client';
import type { ProfileResponse } from '../types/api';

/**
 * Profile endpoints — exact contract from api/internal/users, matching
 * apps/web/lib/profile-api.ts. Avatar upload (multipart) is web-only for
 * this slice — no Expo-compatible image-picker dependency has been
 * introduced yet; see final report for this gap.
 */
export const profileApi = {
  getMe: () => apiClient.get<ProfileResponse>('/users/me'),

  updateMe: (body: { name?: string; mobile_number?: string; about?: string }) =>
    apiClient.patch<ProfileResponse>('/users/me', body),

  changePassword: (body: { current_password: string; new_password: string }) =>
    apiClient.post<{ message: string }>('/users/me/change-password', body),
};
