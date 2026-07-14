import { api, ApiResponse } from "./api";

export type SessionStatus = "live_now" | "upcoming" | "done";

export interface AdminSession {
  id: string;
  title: string;
  faculty: string;
  duration_mins: number;
  program: string;
  org: string;
  org_id: string;
  scheduled_at: string; // RFC3339 UTC
  platform: string;
  enrolled: number;
  present: number;
  attendance_pct: number | null; // only for done sessions
  status: SessionStatus;
  virtual_link?: string;
  meeting_type?: string;
  join_url?: string;
  recording_url?: string;
}

export interface AdminSessionsSummary {
  sessions_this_month: number;
  live_now: number;
  upcoming: number;
  avg_attendance: number | null;
}

export interface AdminSessionsResponse {
  summary: AdminSessionsSummary;
  sessions: AdminSession[];
}

export const sessionsAdminApi = {
  list: (orgId?: string) =>
    api.get<ApiResponse<AdminSessionsResponse>>(
      `/sessions/admin${orgId ? "?org_id=" + orgId : ""}`,
    ),
};
