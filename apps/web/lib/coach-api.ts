import { api, ApiResponse } from "./api";
import type { CoachingEngagementDTO } from "./coaching-admin-api";

// Coach dashboard API - everything is scoped server-side to the logged-in
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
  notes?: string;
  // Mirrors class_sessions' own columns - meeting_type gates whether "Start
  // Session" should be shown at all; join_url/zoom_meeting_id are only
  // populated once a meeting has actually been created (via
  // POST /sessions/:id/start), never at session-creation time.
  meeting_type?: "in_person" | "external_link" | "zoom_embedded" | "microsoft_teams";
  join_url?: string;
  zoom_meeting_id?: string;
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

export interface CreateCoachSessionBody {
  engagement_id: string;
  title: string;
  scheduled_at: string; // RFC3339
  duration_mins: number;
  session_type: "virtual" | "in_person";
  location?: string; // required when session_type === "in_person"
}

export interface CoachBlockDTO {
  id: string;
  blocked_at: string;
  duration_mins: number;
  label?: string;
}

export interface CoachNoteActionDTO {
  id: string;
  description: string;
  due_date?: string;
  status: "open" | "completed";
}

export interface CoachNoteDTO {
  id: string;
  session_id: string;
  session_title: string;
  participant_id?: string;
  coachee_name: string;
  notes: string;
  created_at: string;
  open_actions: number;
  actions: CoachNoteActionDTO[];
}

export interface CoachGoalDTO {
  id: string;
  participant_id: string;
  title: string;
  description?: string;
  target_date?: string;
  status: string;
  progress: number;
}

export interface CoachDocumentDTO {
  id: string;
  participant_id?: string;
  coachee_name?: string;
  title: string;
  doc_type: string;
  uploaded_by: string;
  url?: string;
  is_shared: boolean;
  coach_summary?: string;
  has_file: boolean;
  file_name?: string;
  file_size?: number;
  created_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";
function authToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("xa_token") : null;
}

// Upload a document (multipart). form must include title, participant_id, and
// optionally a "file" field.
export async function uploadCoachDocument(form: FormData): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/coaching/coach/documents`, {
    method: "POST",
    headers: authToken() ? { Authorization: `Bearer ${authToken()}` } : undefined,
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message || "Upload failed");
  return json.data;
}

// Fetch a document's stored file and open it in a new tab (for viewing).
export async function openCoachDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/coaching/coach/documents/${id}/file`, {
    headers: authToken() ? { Authorization: `Bearer ${authToken()}` } : undefined,
  });
  if (!res.ok) throw new Error("File not available");
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), "_blank");
}

// Fetch a document's stored file and trigger a browser download.
export async function downloadCoachDocument(id: string, fallbackName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/coaching/coach/documents/${id}/file`, {
    headers: authToken() ? { Authorization: `Bearer ${authToken()}` } : undefined,
  });
  if (!res.ok) throw new Error("File not available");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const coachApi = {
  summary: () => api.get<ApiResponse<CoachSummaryDTO>>("/coaching/coach/summary"),

  goals: (participantId: string) =>
    api.get<ApiResponse<CoachGoalDTO[]>>(`/coaching/goals?participant_id=${participantId}`),

  documents: (participantId: string) =>
    api.get<ApiResponse<CoachDocumentDTO[]>>(`/coaching/coach/documents?participant_id=${participantId}`),

  allDocuments: () =>
    api.get<ApiResponse<CoachDocumentDTO[]>>("/coaching/coach/documents/all"),

  notes: () => api.get<ApiResponse<CoachNoteDTO[]>>("/coaching/coach/notes"),

  updateAction: (id: string, status: "open" | "completed") =>
    api.patch<ApiResponse<null>>(`/coaching/coach/actions/${id}`, { status }),

  // Update a session note's body (reuses the shared coaching notes endpoint).
  updateNote: (id: string, notes: string) =>
    api.patch<ApiResponse<{ id: string; notes: string }>>(`/coaching/notes/${id}`, { notes }),

  addAction: (body: { session_id: string; description: string; due_date?: string }) =>
    api.post<ApiResponse<CoachNoteActionDTO>>("/coaching/coach/actions", body),

  createNote: (body: { session_id: string; notes: string }) =>
    api.post<ApiResponse<{ id: string }>>("/coaching/coach/notes", body),

  engagements: () =>
    api.get<ApiResponse<CoachingEngagementDTO[]>>("/coaching/coach/engagements"),

  // AI Coaching Pulse - one-line insight on the coach dashboard. On-demand
  // (LLM call), fetched on page load.
  aiPulse: () =>
    api.post<ApiResponse<{ insight: string }>>("/coaching/coach/ai_pulse", {}),

  upcomingSessions: (limit = 10) =>
    api.get<ApiResponse<CoachSessionDTO[]>>(
      `/coaching/coach/sessions/upcoming?limit=${limit}`,
    ),

  // All the coach's sessions within [from, to] (YYYY-MM-DD) for the calendar.
  blocks: (from: string, to: string) =>
    api.get<ApiResponse<CoachBlockDTO[]>>(`/coaching/coach/blocks?from=${from}&to=${to}`),

  createBlock: (body: { blocked_at: string; duration_mins: number; label: string }) =>
    api.post<ApiResponse<{ id: string }>>("/coaching/coach/blocks", body),

  deleteBlock: (id: string) =>
    api.delete<ApiResponse<null>>(`/coaching/coach/blocks/${id}`),

  calendar: (from: string, to: string) =>
    api.get<ApiResponse<CoachSessionDTO[]>>(
      `/coaching/coach/calendar?from=${from}&to=${to}`,
    ),

  pendingActions: (limit = 20) =>
    api.get<ApiResponse<CoachActionDTO[]>>(
      `/coaching/coach/actions/pending?limit=${limit}`,
    ),

  createSession: (body: CreateCoachSessionBody) =>
    api.post<ApiResponse<CoachSessionDTO>>("/coaching/coach/sessions", body),
};

export type { CoachingEngagementDTO };
