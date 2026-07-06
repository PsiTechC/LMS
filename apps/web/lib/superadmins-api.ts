import { api, ApiResponse } from "./api";

export interface SecondarySuperAdminDTO {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

// Manage Secondary Super Admins. Primary Super Admin only (server-enforced via
// the superadmins:manage permission).
export const superadminsApi = {
  list: () =>
    api.get<ApiResponse<SecondarySuperAdminDTO[]>>("/users/superadmins"),

  create: (body: { name: string; email: string; password: string }) =>
    api.post<ApiResponse<SecondarySuperAdminDTO>>("/users/superadmins", body),
};
