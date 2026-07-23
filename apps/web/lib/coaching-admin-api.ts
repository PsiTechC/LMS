import { api, ApiResponse } from "./api";

export interface CoachingOptionDTO {
  id: string;
  name: string;
  email?: string;
  type?: "coach" | "faculty"; // set on coach options so the dropdown can label them
}

export interface CoachDTO {
  user_id: string;
  name: string;
  email: string;
  type: "coach" | "faculty";
  org_id: string;
  org_name: string;
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
  org_name: string;
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

  // The org's enrolled coach roster (shown below the engagements table).
  coaches: (orgId: string) =>
    api.get<ApiResponse<CoachDTO[]>>(`/coaching/admin/coaches?org_id=${orgId}`),

  // Enroll a coach via the same org-level invite flow as faculty, with role=coach.
  // Reuses POST /invitations/faculty (no cohort). Returns the invitation or, if
  // the user already exists in the org, a { message } payload.
  //
  // program_id scopes the coach to a specific program (the org is resolved from
  // that program). Omit program_id for an org-wide coach; when org_id is also the
  // default, the coach lands in the platform-wide "XA-LMS" org.
  enrollCoach: (body: { email: string; org_id: string; program_id?: string }) =>
    api.post<ApiResponse<{ id?: string; message?: string }>>("/invitations/faculty", {
      ...body,
      role: "coach",
    }),
};
