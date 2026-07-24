import { apiClient } from './client';
import type { LoginResponse, UserDTO } from '../types/api';

/**
 * Auth endpoints — exact contract from api/internal/auth/handler.go +
 * dto.go. Do not add fields/endpoints the backend doesn't have.
 */
export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { email, password }, { skipAuthRedirect: true }),
  me: () => apiClient.get<UserDTO>('/auth/me'),
};
