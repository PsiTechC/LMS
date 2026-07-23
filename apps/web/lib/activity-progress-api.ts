import { api, ApiResponse } from "./api";

export interface ActivityProgressDTO {
  id: string;
  activity_id: string;
  participant_id: string;
  status: "not_started" | "in_progress" | "completed";
  progress_pct: number;
  last_position: number;
  notes?: string;
  completed_at?: string;
  updated_at: string;
}

export interface UpsertProgressPayload {
  activity_id: string;
  progress_pct?: number;
  last_position?: number;
  notes?: string;
  completed?: boolean;
}

export interface PingProgressPayload {
  last_position: number;
  delta_seconds: number;
  progress_pct?: number;
}

export const activityProgressApi = {
  // All my progress rows for one program (hydrates the Pre-Work grid).
  listMine: (programId: string) =>
    api.get<ApiResponse<ActivityProgressDTO[]>>(`/activity_progress?program_id=${programId}`),

  // Single activity progress (viewer resume).
  getMine: (activityId: string) =>
    api.get<ApiResponse<ActivityProgressDTO>>(`/activity_progress/${activityId}`),

  // Create / update my progress for an activity.
  upsert: (body: UpsertProgressPayload) =>
    api.post<ApiResponse<ActivityProgressDTO>>("/activity_progress", body),

  // Ping for time tracking and incremental progress
  ping: (activityId: string, body: PingProgressPayload) =>
    api.patch<ApiResponse<ActivityProgressDTO>>(`/activity_progress/${activityId}/ping`, body),
};
