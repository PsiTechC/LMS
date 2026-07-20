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

  bulkEnroll: (cohortId: string, userIds: string[], role = "participant") =>
    api.post<ApiResponse<BulkEnrollResult>>(`/cohorts/${cohortId}/participants/bulk`, { user_ids: userIds, role }),

  stats: (cohortId: string) =>
    api.get<ApiResponse<CohortStatsDTO>>(`/cohorts/${cohortId}/stats`),

  nudge: (cohortId: string, enrollId: string) =>
    api.post<ApiResponse<null>>(`/cohorts/${cohortId}/participants/${enrollId}/nudge`, {}),

  myEnrollments: () =>
    api.get<ApiResponse<MyEnrollmentDTO[]>>("/cohorts/my"),

  pool: (programId: string, orgId: string) =>
    api.get<ApiResponse<PoolParticipantDTO[]>>(`/cohorts/pool?program_id=${programId}&org_id=${orgId}`),

  transfer: (cohortId: string, body: { user_id: string; from_cohort_id?: string }) =>
    api.post<ApiResponse<null>>(`/cohorts/${cohortId}/transfer`, body),

  randomDistribute: (programId: string) =>
    api.post<ApiResponse<{ distributed: number; per_cohort: number }>>(`/cohorts/distribute`, { program_id: programId }),

  // AI Cohort Pulse - one-line insight on Cohort Management (unassigned
  // participants, cohort load balance). On-demand (LLM call), fetched on page load.
  aiPulse: (programId: string) =>
    api.post<ApiResponse<{ insight: string }>>(`/cohorts/ai_pulse?program_id=${programId}`, {}),

  // AI Daily Focus - one-line nudge on the participant's My Journey. On-demand
  // (LLM call), fetched on page load.
  aiDailyFocus: () =>
    api.post<ApiResponse<{ insight: string }>>(`/cohorts/ai_daily_focus`, {}),

  listGroups: (cohortId: string) =>
    api.get<ApiResponse<GroupDTO[]>>(`/cohorts/${cohortId}/groups`),

  createGroups: (cohortId: string, body: { count: number; name_prefix?: string; group_type?: string }) =>
    api.post<ApiResponse<GroupDTO[]>>(`/cohorts/${cohortId}/groups`, body),

  reshuffleGroups: (cohortId: string, body: { count: number; name_prefix?: string; group_type?: string }) =>
    api.post<ApiResponse<GroupDTO[]>>(`/cohorts/${cohortId}/groups/reshuffle`, body),

  deleteGroup: (cohortId: string, groupId: string) =>
    api.delete<ApiResponse<null>>(`/cohorts/${cohortId}/groups/${groupId}`),

  moveMember: (cohortId: string, body: { enrollment_id: string; to_group_id: string }) =>
    api.post<ApiResponse<null>>(`/cohorts/${cohortId}/groups/move`, body),

  enrollByEmail: (cohortId: string, participants: ParticipantInput[]) =>
    api.post<ApiResponse<EnrollByEmailResult>>(`/cohorts/${cohortId}/enroll`, { participants }),

  enrollCSV: (cohortId: string, file: File, role?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (role) form.append("role", role);
    const token = typeof window !== "undefined" ? localStorage.getItem("xa_token") : null;
    return fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1"}/cohorts/${cohortId}/enroll/csv`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(r => r.json()) as Promise<ApiResponse<CSVImportResult>>;
  },
};

export interface PoolParticipantDTO {
  user_id: string;
  name: string;
  email: string;
  department?: string;
}

export interface GroupMemberDTO {
  enrollment_id: string;
  user_id: string;
  name: string;
  email: string;
  department?: string;
}

export interface GroupDTO {
  id: string;
  cohort_id: string;
  name: string;
  group_type: string;
  sort_order: number;
  members: GroupMemberDTO[];
}

export interface ParticipantInput {
  name: string;
  email: string;
  department?: string;
  seniority?: string;
  function?: string;
  location?: string;
}

export interface EnrollByEmailResult {
  enrolled: number;
  already_in: number;
  failed: number;
  errors: { email: string; reason: string }[];
}

export interface CSVImportResult {
  success_count: number;
  failed_count: number;
  errors: { email: string; reason: string }[];
}

export interface BulkEnrollResult {
  enrolled: string[];
  skipped:  string[];
  failed:   string[];
}

export interface CohortStatsDTO {
  cohort_id:         string;
  total_enrolled:    number;
  completed:         number;
  active:            number;
  withdrawn:         number;
  on_hold:           number;
  avg_completion:    number;
  at_risk_count:     number;
  medium_risk_count: number;
}

export interface MyEnrollmentDTO {
  enrollment_id: string;
  cohort_id: string;
  cohort_name: string;
  cohort_start_date?: string;
  cohort_end_date?: string;
  role: string;
  status: string;
  completion_percent: number;
  risk_level: "low" | "medium" | "high";
  enrolled_at: string;
  program_id: string;
  program_title: string;
  program_description?: string;
  program_color: string;
  program_duration_weeks: number;
  program_status: string;
}
