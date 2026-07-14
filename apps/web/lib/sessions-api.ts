import { api, ApiResponse } from "./api";

export interface AgendaItem {
  time?: string;
  title: string;
  description?: string;
}

export interface SessionDTO {
  id: string;
  program_id: string;
  cohort_id: string;
  activity_id?: string;
  faculty_id: string;
  faculty_name?: string;
  title: string;
  description?: string;
  session_type: string;
  virtual_link?: string;
  meeting_type?: string;
  join_url?: string;
  whiteboard_url?: string;
  scheduled_at: string;
  duration_mins: number;
  status: string;
  agenda: AgendaItem[];
  notes?: string;
  reminder_enabled: boolean;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface SessionMaterialDTO {
  id: string;
  session_id: string;
  uploaded_by: string;
  title: string;
  type: string;
  url: string;
  created_at: string;
}

export const sessionsApi = {
  list: (params: { cohort_id?: string; faculty_id?: string; status?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.cohort_id) qs.set("cohort_id", params.cohort_id);
    if (params.faculty_id) qs.set("faculty_id", params.faculty_id);
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return api.get<ApiResponse<SessionDTO[]>>(`/sessions${query ? `?${query}` : ""}`);
  },

  get: (id: string) =>
    api.get<ApiResponse<SessionDTO>>(`/sessions/${id}`),

  listMaterials: (id: string) =>
    api.get<ApiResponse<SessionMaterialDTO[]>>(`/sessions/${id}/materials`),
};
