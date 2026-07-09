import { api, ApiResponse } from "./api";

export type FacultyStatus = "active" | "onboarding" | "inactive";

export interface FacultyProgramRef {
  id: string;
  title: string;
}

export interface FacultyRosterItemDTO {
  user_id: string;
  name: string;
  location: string;
  joined_at: string;
  specialization: string;
  certifications: string[];
  status: FacultyStatus;
  sessions_delivered: number;
  sessions_scheduled: number;
  engagement_pct: number;
  assigned_programs: FacultyProgramRef[];
}

export interface FacultyDashboardSummaryDTO {
  total_faculty: number;
  onboarding_count: number;
  total_sessions_delivered: number;
  avg_engagement_pct: number;
}

// Full profile (View Profile drawer) — from GET /faculty_profiles/:user_id
export interface FacultyProfileDTO {
  id: string;
  user_id: string;
  specialization: string;
  certifications: string[];
  bio: string;
  delivery_modes: string[];
  location: string;
  linkedin_url: string;
  created_at: string;
  updated_at: string;
}

// ── Onboard Faculty (4-step wizard → single submit) ──────────────────────────

export interface OnboardAssignmentBody {
  program_id?: string;
  activity_id?: string;
  cohort_id?: string;
  role?: string;
  role_on_program?: string;
  sessions_planned?: number;
  availability?: unknown;
}

export interface OnboardFacultyBody {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  org_id?: string;
  specialization?: string;
  certifications?: string[];
  bio?: string;
  delivery_modes?: string[];
  linkedin_url?: string;
  assignments?: OnboardAssignmentBody[];
  access_level?: string;
  send_welcome_email?: boolean;
}

export interface OnboardFacultyResponse {
  user_id: string;
  invite_id: string;
  email: string;
  access_level: string;
  assignments_created: number;
  welcome_email_sent: boolean;
  temporary_password?: string;
}

export const facultyMgmtApi = {
  roster: (orgId?: string, programId?: string) => {
    const params = new URLSearchParams();
    if (orgId) params.set("org_id", orgId);
    if (programId) params.set("program_id", programId);
    const qs = params.toString();
    return api.get<ApiResponse<FacultyRosterItemDTO[]>>(`/faculty${qs ? `?${qs}` : ""}`);
  },
  summary: (orgId?: string) =>
    api.get<ApiResponse<FacultyDashboardSummaryDTO>>(`/faculty/dashboard/summary${orgId ? `?org_id=${orgId}` : ""}`),
  profile: (userId: string) => api.get<ApiResponse<FacultyProfileDTO>>(`/faculty_profiles/${userId}`),
  onboard: (body: OnboardFacultyBody) =>
    api.post<ApiResponse<OnboardFacultyResponse>>(`/faculty/onboard`, body),

  // Manage Faculty Access modal
  setActive: (userId: string, is_active: boolean) =>
    api.patch<ApiResponse<unknown>>(`/users/${userId}`, { is_active }),
  assignProgram: (faculty_user_id: string, program_id: string) =>
    api.post<ApiResponse<null>>(`/faculty_assignments/program`, { faculty_user_id, program_id }),
  unassignProgram: (faculty_user_id: string, program_id: string) =>
    api.delete<ApiResponse<null>>(`/faculty_assignments/program?faculty_user_id=${faculty_user_id}&program_id=${program_id}`),
};
