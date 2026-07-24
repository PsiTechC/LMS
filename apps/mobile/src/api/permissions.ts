import { apiClient } from './client';

/**
 * Effective-permissions endpoint — exact contract from
 * api/internal/roles/handler.go `myPermissions` (GET /me/permissions),
 * matching apps/web/components/layout/Sidebar.tsx's use of the same
 * endpoint for nav gating. `full` means unrestricted (bootstrap superadmin);
 * `permissions` is the resolved "resource:action" grant set otherwise.
 */
export interface MyPermissionsDTO {
  full: boolean;
  permissions: string[];
  is_primary_pm: boolean;
}

export const permissionsApi = {
  my: () => apiClient.get<MyPermissionsDTO>('/me/permissions'),
};
