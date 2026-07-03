import { api, ApiResponse } from "./api";

export interface MyCoachingGoalDTO {
  id: string;
  title: string;
  description?: string;
  target_date?: string;
  status: string;
}

export interface MyCoachingNoteDTO {
  id: string;
  notes: string;
  created_at: string;
}

export interface MyCoachingDTO {
  has_engagement: boolean;
  coach_name?: string;
  coach_credential?: string;
  engagement_name?: string;
  assignment_type?: string;
  frequency?: string;
  status?: string;
  total_sessions: number;
  completed_sessions: number;
  coaching_score?: number;
  goals: MyCoachingGoalDTO[];
  session_notes: MyCoachingNoteDTO[];
}

export const coachingApi = {
  // Participant: their own read-only coaching view.
  // programId scopes to the program the switcher is on (multi-program participants).
  my: (programId?: string) =>
    api.get<ApiResponse<MyCoachingDTO>>(`/coaching/my${programId ? `?program_id=${programId}` : ""}`),
};
