import { api, ApiResponse } from "./api";
import type { CoachingEngagementDTO } from "./coaching-admin-api";

// Coach dashboard API — everything is scoped server-side to the logged-in
// coach (coach_id = the caller), so no id needs to be passed from the client.

export interface CoachSummaryDTO {
  active_engagements: number;
  scheduled_engagements: number;
  upcoming_sessions: number;
  pending_actions: number;
  sessions_done: number;
  sessions_total: number;
}

export interface CoachSessionDTO {
  id: string;
  title: string;
  session_type: string; // classroom | coaching_group | coaching_individual
  virtual_link?: string;
  scheduled_at: string;
  duration_mins: number;
  status: string;
  cohort_id?: string;
  cohort_name?: string;
  program_title: string;
  engagement_id?: string;
  engagement_type?: "individual" | "group";
  engagement_name?: string;
  coachee_name?: string;
  participant_count: number;
}

export interface CoachActionDTO {
  id: string;
  description: string;
  due_date?: string;
  status: string;
  participant_id?: string;
  participant_name?: string;
  session_title: string;
}

export const coachApi = {
  summary: () => api.get<ApiResponse<CoachSummaryDTO>>("/coaching/coach/summary"),

  engagements: () =>
    api.get<ApiResponse<CoachingEngagementDTO[]>>("/coaching/coach/engagements"),

  upcomingSessions: (limit = 10) =>
    api.get<ApiResponse<CoachSessionDTO[]>>(
      `/coaching/coach/sessions/upcoming?limit=${limit}`,
    ),

  pendingActions: (limit = 20) =>
    api.get<ApiResponse<CoachActionDTO[]>>(
      `/coaching/coach/actions/pending?limit=${limit}`,
    ),
};

export type { CoachingEngagementDTO };
