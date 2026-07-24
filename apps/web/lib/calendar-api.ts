import { api, ApiResponse } from "./api";

export interface CalendarEvent {
  id: string;
  title: string;
  type: "session" | "coaching";
  scheduled_at: string; // RFC3339 UTC
  duration_mins: number;
  status: "upcoming" | "live_now" | "done";
  program_id: string;
  program_title: string;
  program_color: string;
  org_id: string;
  org_name: string;
  cohort_id?: string;
  cohort_name?: string;
  faculty_name?: string;
  coach_name?: string;
  participant_count: number;
  virtual_link?: string;
  join_url?: string;
  meeting_type?: string;
  location?: string;
  session_type?: string; // "classroom" | "coaching_group" | "coaching_individual"
}

export interface CalendarEventsResponse {
  data: CalendarEvent[];
  meta: { total: number };
}

export const calendarApi = {
  getEvents: (opts?: {
    from?: string;
    to?: string;
    orgId?: string;
    programId?: string;
    type?: "session" | "coaching" | "all";
  }) => {
    const params = new URLSearchParams();
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    if (opts?.orgId) params.set("org_id", opts.orgId);
    if (opts?.programId) params.set("program_id", opts.programId);
    if (opts?.type && opts.type !== "all") params.set("type", opts.type);
    const qs = params.toString();
    return api.get<ApiResponse<CalendarEvent[]>>(`/calendar/events${qs ? "?" + qs : ""}`);
  },
};
