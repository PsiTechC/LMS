import { api, ApiResponse } from "./api";

export interface CoachingOptionDTO {
  id: string;
  name: string;
  email?: string;
}

export interface CoachingProgramOptionDTO {
  id: string;
  title: string;
}

export interface CoachingCohortOptionDTO {
  id: string;
  program_id: string;
  name: string;
}

export interface CoachingAdminOptionsDTO {
  programs: CoachingProgramOptionDTO[];
  cohorts: CoachingCohortOptionDTO[];
  participants: CoachingOptionDTO[];
  coaches: CoachingOptionDTO[];
}

export interface CoachingEngagementDTO {
  id: string;
  org_id: string;
  program_id: string;
  program_title: string;
  cohort_id?: string;
  cohort_name?: string;
  coach_id: string;
  coach_name: string;
  assigned_by_id: string;
  assigned_by_name: string;
  assignment_type: "individual" | "group";
  name: string;
  status: "scheduled" | "active" | "completed" | "cancelled";
  start_date?: string;
  frequency: string;
  total_sessions: number;
  completed_sessions: number;
  goals: string[];
  participants: CoachingOptionDTO[];
  created_at: string;
  updated_at: string;
}

export interface CreateCoachingEngagementBody {
  org_id: string;
  program_id: string;
  cohort_id?: string;
  coach_id: string;
  assignment_type: "individual" | "group";
  name?: string;
  participant_ids: string[];
  start_date?: string;
  frequency: string;
  total_sessions: number;
  goals: string[];
}

export const coachingAdminApi = {
  options: (orgId: string) =>
    api.get<ApiResponse<CoachingAdminOptionsDTO>>(`/coaching/admin/options?org_id=${orgId}`),

  list: (orgId: string) =>
    api.get<ApiResponse<CoachingEngagementDTO[]>>(`/coaching/admin/engagements?org_id=${orgId}`),

  create: (body: CreateCoachingEngagementBody) =>
    api.post<ApiResponse<CoachingEngagementDTO>>("/coaching/admin/engagements", body),
};
