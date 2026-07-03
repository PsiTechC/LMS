import { api, ApiResponse } from "./api";

export interface CompetencyDTO {
  id: string;
  org_id: string;
  title: string;
  description?: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityCompetencyDTO {
  activity_id: string;
  competency_id: string;
  title: string;
  category: string;
  level: string;
  created_at: string;
}

export interface TemplatePhaseDTO {
  title: string;
  week_label?: string;
  activities: { title: string; type: string; duration_mins: number }[];
}

export interface TemplateDTO {
  id: string;
  org_id?: string;
  title: string;
  description?: string;
  category: string;
  duration_weeks: number;
  structure: { phases: TemplatePhaseDTO[] };
  is_system: boolean;
  created_at: string;
}

export const competenciesApi = {
  list: (orgId: string) =>
    api.get<ApiResponse<CompetencyDTO[]>>(`/competencies?org_id=${orgId}`),

  create: (orgId: string, body: { title: string; description?: string; category: string }) =>
    api.post<ApiResponse<CompetencyDTO>>(`/competencies?org_id=${orgId}`, body),

  update: (id: string, body: { title?: string; description?: string; category?: string }) =>
    api.patch<ApiResponse<CompetencyDTO>>(`/competencies/${id}`, body),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/competencies/${id}`),

  listForActivity: (activityId: string) =>
    api.get<ApiResponse<ActivityCompetencyDTO[]>>(`/competencies/activity/${activityId}`),

  mapToActivity: (activityId: string, competencyId: string, level = "intermediate") =>
    api.post<ApiResponse<null>>(`/competencies/activity/${activityId}`, { competency_id: competencyId, level }),

  unmapFromActivity: (activityId: string, competencyId: string) =>
    api.delete<ApiResponse<null>>(`/competencies/activity/${activityId}/${competencyId}`),

  listTemplates: (orgId?: string) =>
    api.get<ApiResponse<TemplateDTO[]>>(`/competencies/templates${orgId ? `?org_id=${orgId}` : ""}`),
};

export const submissionsStatsApi = {
  myStats: () =>
    api.get<ApiResponse<{ pending_grades: number; total_graded: number }>>("/submissions/stats"),
};
