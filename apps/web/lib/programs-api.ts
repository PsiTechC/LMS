import { api, ApiResponse } from "./api";

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
  is_mandatory: boolean;
}

export interface PhaseDTO {
  id: string;
  program_id: string;
  title: string;
  description?: string;
  phase_number: number;
  week_label?: string;
  color: string;
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

  // Phases
  createPhase: (programId: string, body: { title: string; description?: string; phase_number: number; week_label?: string; color?: string }) =>
    api.post<ApiResponse<PhaseDTO>>(`/programs/${programId}/phases`, body),

  updatePhase: (programId: string, phaseId: string, body: Partial<{ title: string; description: string; phase_number: number; week_label: string; color: string }>) =>
    api.patch<ApiResponse<PhaseDTO>>(`/programs/${programId}/phases/${phaseId}`, body),

  deletePhase: (programId: string, phaseId: string) =>
    api.delete<ApiResponse<null>>(`/programs/${programId}/phases/${phaseId}`),

  reorderPhases: (programId: string, phaseIds: string[]) =>
    api.post<ApiResponse<null>>(`/programs/${programId}/phases/reorder`, { phase_ids: phaseIds }),

  // Activities
  createActivity: (programId: string, body: { phase_id: string; title: string; description?: string; type: string; delivery_mode?: string; duration_mins?: number; due_day_offset?: number; is_mandatory?: boolean }) =>
    api.post<ApiResponse<ActivityDTO>>(`/programs/${programId}/activities`, body),

  updateActivity: (programId: string, actId: string, body: Partial<{ title: string; description: string; delivery_mode: string; duration_mins: number; due_day_offset: number; is_mandatory: boolean; sort_order: number }>) =>
    api.patch<ApiResponse<ActivityDTO>>(`/programs/${programId}/activities/${actId}`, body),

  deleteActivity: (programId: string, actId: string) =>
    api.delete<ApiResponse<null>>(`/programs/${programId}/activities/${actId}`),
};
