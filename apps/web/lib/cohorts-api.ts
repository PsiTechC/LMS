import { api, ApiResponse } from "./api";

export interface CohortDTO {
  id: string;
  program_id: string;
  org_id: string;
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  max_seats: number;
  is_active: boolean;
  enrolled_count: number;
  created_at: string;
}

export interface ParticipantDTO {
  enrollment_id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url?: string;
  department?: string;
  role: string;
  status: string;
  completion_percent: number;
  risk_level: "low" | "medium" | "high";
  enrolled_at: string;
  nudged_at?: string;
}

export const cohortsApi = {
  list: (orgId: string, programId?: string) => {
    const qs = programId
      ? `?org_id=${orgId}&program_id=${programId}`
      : `?org_id=${orgId}`;
    return api.get<ApiResponse<CohortDTO[]>>(`/cohorts${qs}`);
  },

  get: (id: string) =>
    api.get<ApiResponse<CohortDTO>>(`/cohorts/${id}`),

  create: (orgId: string, body: { program_id: string; name: string; description?: string; start_date?: string; end_date?: string; max_seats?: number }) =>
    api.post<ApiResponse<CohortDTO>>(`/cohorts?org_id=${orgId}`, body),

  update: (id: string, body: Partial<{ name: string; description: string; start_date: string; end_date: string; max_seats: number; is_active: boolean }>) =>
    api.patch<ApiResponse<CohortDTO>>(`/cohorts/${id}`, body),

  listParticipants: (cohortId: string) =>
    api.get<ApiResponse<ParticipantDTO[]>>(`/cohorts/${cohortId}/participants`),

  enroll: (cohortId: string, userId: string, role = "participant") =>
    api.post<ApiResponse<ParticipantDTO>>(`/cohorts/${cohortId}/participants`, { user_id: userId, role }),

  updateEnrollment: (cohortId: string, enrollId: string, body: Partial<{ status: string; completion_percent: number; risk_level: string }>) =>
    api.patch<ApiResponse<ParticipantDTO>>(`/cohorts/${cohortId}/participants/${enrollId}`, body),

  nudge: (cohortId: string, enrollId: string) =>
    api.post<ApiResponse<null>>(`/cohorts/${cohortId}/participants/${enrollId}/nudge`, {}),
};
