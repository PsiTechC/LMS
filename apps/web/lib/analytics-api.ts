import { api, ApiResponse } from "./api";

export interface EngagementPoint {
  week_number: number;
  week_label: string;
  engagement_pct: number;
}

export interface CompetencyScore {
  id: string;
  cohort_id: string;
  competency_id: string;
  title: string;
  category: string;
  pre_program_pct: number;
  current_pct: number;
  updated_at: string;
}

export const analyticsApi = {
  engagement: (cohortId: string) =>
    api.get<ApiResponse<EngagementPoint[]>>(`/analytics/engagement?cohort_id=${cohortId}`),

  competencyScores: (cohortId: string) =>
    api.get<ApiResponse<CompetencyScore[]>>(`/analytics/competencies?cohort_id=${cohortId}`),

  upsertCompetencyScore: (body: {
    cohort_id: string;
    competency_id: string;
    pre_program_pct: number;
    current_pct: number;
  }) => api.post<ApiResponse<null>>("/analytics/competencies", body),

  deleteCompetencyScore: (id: string) =>
    api.delete<ApiResponse<null>>(`/analytics/competencies/${id}`),
};
