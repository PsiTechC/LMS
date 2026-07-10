import { api, ApiResponse } from "./api";

export interface CompetencyScoreDTO {
  competency_id: string;
  title: string;
  self_score?: number;
  others_score?: number;
  gap?: number;
}

export interface RaterDTO {
  id: string;
  name: string;
  email: string;
  relationship: "manager" | "peer" | "direct_report" | "skip_level" | "others";
  status: "pending" | "submitted";
  reminded_at?: string;
  submitted_at?: string;
}

export interface QuorumDTO {
  relationship: "manager" | "peer" | "direct_report" | "skip_level" | "others";
  min: number;
  nominated: number;
  submitted: number;
  met: boolean;
}

export interface CycleDTO {
  id: string;
  title: string;
  cycle_type: string;
  status: "draft" | "open" | "closed";
  deadline?: string;
  ai_summary?: string;
  raters_invited: number;
  raters_submitted: number;
  raters: RaterDTO[];
  competencies: CompetencyScoreDTO[];
  quorum: QuorumDTO[];
  created_at: string;
}

export interface CreateCyclePayload {
  title?: string;
  cycle_type?: string;
  program_id?: string;
  cohort_id?: string;
  deadline?: string;
  competency_ids?: string[];
}

export interface AddRaterPayload {
  name: string;
  email: string;
  relationship: "manager" | "peer" | "direct_report" | "skip_level" | "others";
}

export const feedback360Api = {
  // Participant: their latest cycle (404 if none yet). programId scopes to the
  // program the switcher is on (falls back to latest overall when none there).
  myCycle: (programId?: string) =>
    api.get<ApiResponse<CycleDTO>>(`/feedback_360/my${programId ? `?program_id=${programId}` : ""}`),

  createCycle: (body: CreateCyclePayload) =>
    api.post<ApiResponse<CycleDTO>>("/feedback_360/cycles", body),

  addRater: (cycleId: string, body: AddRaterPayload) =>
    api.post<ApiResponse<CycleDTO>>(`/feedback_360/cycles/${cycleId}/raters`, body),

  removeRater: (cycleId: string, raterId: string) =>
    api.delete<ApiResponse<CycleDTO>>(`/feedback_360/cycles/${cycleId}/raters/${raterId}`),

  remindRater: (cycleId: string, raterId: string) =>
    api.post<ApiResponse<CycleDTO>>(`/feedback_360/cycles/${cycleId}/raters/${raterId}/remind`, {}),
};
