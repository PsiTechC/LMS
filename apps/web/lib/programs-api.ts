import { api, ApiResponse } from "./api";

export interface ActivityFacultyDTO {
  id: string;
  activity_id: string;
  faculty_user_id: string;
  name: string;
  email: string;
  avatar_url?: string;
  role: string;
  override_note?: string;
}

export interface ConflictDTO {
  activity_id: string;
  activity_title: string;
  program_title: string;
  cohort_name: string;
  start_date: string;
  end_date: string;
  role: string;
}

export interface OrgFacultyMember {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

export interface FacultyScheduleDay {
  date: string;
  is_busy: boolean;
  session_id?: string;
  session_title?: string;
  program_title?: string;
  role?: string;
}

export interface FacultyAssignmentDTO {
  activity_id: string;
  activity_title: string;
  activity_type: string;
  phase_name: string;
  program_id: string;
  program_title: string;
  program_color: string;
  role: string;
  start_day: number;
  duration_days: number;
}

export interface ActivityDTO {
  id: string;
  phase_id: string;
  title: string;
  description?: string;
  type: string;
  delivery_mode: string;
  sort_order: number;
  duration_mins: number;
  due_day_offset: number;
  start_day: number;
  duration_days: number;
  is_mandatory: boolean;
  faculty?: ActivityFacultyDTO[];
}

export interface PhaseDTO {
  id: string;
  program_id: string;
  title: string;
  description?: string;
  phase_number: number;
  week_label?: string;
  color: string;
  start_day: number;
  end_day: number;
  activities: ActivityDTO[];
}

export interface ProgramDTO {
  id: string;
  org_id: string;
  title: string;
  description?: string;
  status: "draft" | "active" | "upcoming" | "delivered" | "archived";
  color: string;
  duration_weeks: number;
  start_date?: string;
  end_date?: string;
  published_at?: string;
  phase_count: number;
  activity_count: number;
  created_at: string;
}

export interface ProgramDetailDTO extends ProgramDTO {
  phases: PhaseDTO[];
}

export const programsApi = {
  // Public listing — no auth required, used on the landing page
  listPublic: () =>
    api.get<ApiResponse<ProgramDTO[]>>(`/programs/public`),

  list: (orgId: string) =>
    api.get<ApiResponse<ProgramDTO[]>>(`/programs?org_id=${orgId}`),

  get: (id: string) =>
    api.get<ApiResponse<ProgramDetailDTO>>(`/programs/${id}`),

  create: (orgId: string, body: { title: string; description?: string; color?: string; duration_weeks?: number }) =>
    api.post<ApiResponse<ProgramDTO>>(`/programs?org_id=${orgId}`, body),

  update: (id: string, body: Partial<{ title: string; description: string; color: string; duration_weeks: number; start_date: string; end_date: string }>) =>
    api.patch<ApiResponse<ProgramDTO>>(`/programs/${id}`, body),

  publish: (id: string) =>
    api.post<ApiResponse<ProgramDTO>>(`/programs/${id}/publish`, {}),

  duplicate: (id: string) =>
    api.post<ApiResponse<ProgramDTO>>(`/programs/${id}/duplicate`, {}),

  // Phases
  createPhase: (programId: string, body: { title: string; description?: string; phase_number: number; week_label?: string; color?: string; start_day?: number; end_day?: number }) =>
    api.post<ApiResponse<PhaseDTO>>(`/programs/${programId}/phases`, body),

  updatePhase: (programId: string, phaseId: string, body: Partial<{ title: string; description: string; phase_number: number; week_label: string; color: string; start_day: number; end_day: number }>) =>
    api.patch<ApiResponse<PhaseDTO>>(`/programs/${programId}/phases/${phaseId}`, body),

  deletePhase: (programId: string, phaseId: string) =>
    api.delete<ApiResponse<null>>(`/programs/${programId}/phases/${phaseId}`),

  reorderPhases: (programId: string, phaseIds: string[]) =>
    api.post<ApiResponse<null>>(`/programs/${programId}/phases/reorder`, { phase_ids: phaseIds }),

  // Activities
  createActivity: (programId: string, body: { phase_id: string; title: string; description?: string; type: string; delivery_mode?: string; duration_mins?: number; due_day_offset?: number; start_day?: number; duration_days?: number; is_mandatory?: boolean }) =>
    api.post<ApiResponse<ActivityDTO>>(`/programs/${programId}/activities`, body),

  updateActivity: (programId: string, actId: string, body: Partial<{ title: string; description: string; delivery_mode: string; duration_mins: number; due_day_offset: number; start_day: number; duration_days: number; is_mandatory: boolean; sort_order: number }>) =>
    api.patch<ApiResponse<ActivityDTO>>(`/programs/${programId}/activities/${actId}`, body),

  deleteActivity: (programId: string, actId: string) =>
    api.delete<ApiResponse<null>>(`/programs/${programId}/activities/${actId}`),

  // Org faculty list
  listOrgFaculty: (orgId: string) =>
    api.get<ApiResponse<OrgFacultyMember[]>>(`/programs/faculty?org_id=${orgId}`),

  // Activity faculty assignment
  listActivityFaculty: (programId: string, actId: string) =>
    api.get<ApiResponse<ActivityFacultyDTO[]>>(`/programs/${programId}/activities/${actId}/faculty`),

  assignFaculty: (programId: string, actId: string, body: { faculty_user_id: string; role: string; override_note?: string }) =>
    api.post<ApiResponse<ActivityFacultyDTO> & { data?: { has_conflict?: boolean; conflicts?: ConflictDTO[] } }>(`/programs/${programId}/activities/${actId}/faculty`, body),

  removeFaculty: (programId: string, actId: string, facultyUserId: string) =>
    api.delete<ApiResponse<null>>(`/programs/${programId}/activities/${actId}/faculty/${facultyUserId}`),

  // Faculty schedule calendar
  getFacultySchedule: (facultyId: string) =>
    api.get<ApiResponse<FacultyScheduleDay[]>>(`/programs/faculty/${facultyId}/schedule`),

  // All activities/programs a faculty member is assigned to deliver
  getFacultyAssignments: (facultyId: string) =>
    api.get<ApiResponse<FacultyAssignmentDTO[]>>(`/programs/faculty/${facultyId}/assignments`),
};
