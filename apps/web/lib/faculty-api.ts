import { api, ApiResponse, BASE_URL } from "./api";

// ── Content Library File API ───────────────────────────────────────────────

export interface UploadResult {
  content_id: string;    // UUID — use this to preview/download; never a file path
  original_name: string;
  mime_type: string;
  size_bytes: number;
}

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("xa_token") : null;
}

/** Upload a file. Returns a content_id — no URL or filesystem path is exposed. */
export async function uploadFile(file: File): Promise<ApiResponse<UploadResult>> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}/uploads`, {
    method: "POST",
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Upload failed");
  return json;
}

/**
 * Fetch file bytes with auth and return a short-lived blob URL.
 * The browser address bar shows blob:// — no localhost URL, no file path exposed.
 * Caller must revoke the URL after use to free memory.
 */
export async function fetchFileBlob(
  contentId: string,
  mode: "preview" | "download" = "preview"
): Promise<{ blobUrl: string; mimeType: string; originalName: string }> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/uploads/${contentId}/${mode}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (res.status === 403) throw new Error("FORBIDDEN");
  if (!res.ok) throw new Error("FETCH_FAILED");

  // Strip charset / boundary parameters (e.g. "application/pdf; charset=utf-8" → "application/pdf")
  const mimeType = (res.headers.get("Content-Type") ?? "application/octet-stream").split(";")[0].trim();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  // Match both quoted and unquoted filenames
  const nameMatch = disposition.match(/filename[^;=\n]*=(?:(['"])([^'"]*)\1|([^;\s]*))/i);
  const originalName = (nameMatch?.[2] ?? nameMatch?.[3] ?? "file").replace(/^"|"$/g, "");

  const blob = await res.blob();
  return { blobUrl: URL.createObjectURL(blob), mimeType, originalName };
}

// ── Session ────────────────────────────────────────────────────────────────

export interface AgendaItemDTO {
  id: string;
  title: string;
  duration_mins: number;
  type: "presentation" | "discussion" | "activity" | "break" | "poll";
}

export interface SessionDTO {
  id: string;
  program_id: string;
  cohort_id: string;
  faculty_id: string;
  title: string;
  description?: string;
  session_type: string;
  virtual_link?: string;
  whiteboard_url?: string;
  scheduled_at: string;
  duration_mins: number;
  status: string;
  agenda: AgendaItemDTO[];
  notes?: string;
  reminder_enabled: boolean;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface MaterialDTO {
  id: string;
  session_id: string;
  uploaded_by: string;
  title: string;
  type: string;
  url: string;
  created_at: string;
}

export interface AttendanceDTO {
  session_id: string;
  user_id: string;
  status: string;
  marked_at: string;
}

// ── Polls ──────────────────────────────────────────────────────────────────

export interface PollDTO {
  id: string;
  session_id: string;
  question: string;
  options: string[];
  is_active: boolean;
  created_at: string;
}

export interface PollResultsDTO {
  poll_id: string;
  question: string;
  options: string[];
  votes: { option_index: number; option: string; count: number }[];
  total: number;
}

// ── Action Items ───────────────────────────────────────────────────────────

export interface ActionItemDTO {
  id: string;
  session_id: string;
  participant_id?: string;
  description: string;
  due_date?: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Submissions ────────────────────────────────────────────────────────────

export interface SubmissionDTO {
  id: string;
  activity_id: string;
  participant_id: string;
  content?: string;
  file_url?: string;
  status: string;
  grade?: number;
  feedback?: string;
  graded_by?: string;
  submitted_at: string;
}

// ── Coaching Notes ─────────────────────────────────────────────────────────

export interface CoachingNoteDTO {
  id: string;
  session_id: string;
  faculty_id: string;
  participant_id: string;
  notes: string;
  is_private: boolean;
  created_at: string;
  updated_at: string;
}

// ── Sessions API ───────────────────────────────────────────────────────────

export const sessionsApi = {
  list: (params?: { cohort_id?: string; faculty_id?: string; status?: string; page?: number; limit?: number }) => {
    const filtered = Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== "")
    );
    const q = new URLSearchParams(filtered as Record<string, string>).toString();
    return api.get<ApiResponse<SessionDTO[]>>(`/sessions${q ? "?" + q : ""}`);
  },
  get: (id: string) =>
    api.get<ApiResponse<SessionDTO>>(`/sessions/${id}`),
  create: (body: {
    program_id: string; cohort_id: string; faculty_id?: string; title: string; description?: string;
    session_type: string; virtual_link?: string; scheduled_at: string; duration_mins: number;
  }) => api.post<ApiResponse<SessionDTO>>("/sessions", body),
  update: (id: string, body: Partial<{
    title: string; description: string; virtual_link: string; whiteboard_url: string;
    scheduled_at: string; duration_mins: number; status: string; reminder_enabled: boolean;
  }>) => api.patch<ApiResponse<SessionDTO>>(`/sessions/${id}`, body),

  // Lifecycle
  start: (id: string) =>
    api.post<ApiResponse<SessionDTO>>(`/sessions/${id}/start`, {}),
  end: (id: string) =>
    api.post<ApiResponse<SessionDTO>>(`/sessions/${id}/end`, {}),

  // Agenda
  updateAgenda: (id: string, items: AgendaItemDTO[]) =>
    api.patch<ApiResponse<null>>(`/sessions/${id}/agenda`, { items }),

  // Notes
  updateNotes: (id: string, notes: string) =>
    api.patch<ApiResponse<null>>(`/sessions/${id}/notes`, { notes }),

  // Materials
  getMaterials: (id: string) =>
    api.get<ApiResponse<MaterialDTO[]>>(`/sessions/${id}/materials`),
  addMaterial: (id: string, body: { title: string; type: string; url: string; size_bytes?: number }) =>
    api.post<ApiResponse<MaterialDTO>>(`/sessions/${id}/materials`, body),
  deleteMaterial: (sessionId: string, materialId: string) =>
    api.delete<ApiResponse<null>>(`/sessions/${sessionId}/materials/${materialId}`),

  // Attendance
  getAttendance: (id: string) =>
    api.get<ApiResponse<AttendanceDTO[]>>(`/sessions/${id}/attendance`),
  markAttendance: (id: string, entries: { user_id: string; status: string }[]) =>
    api.post<ApiResponse<null>>(`/sessions/${id}/attendance`, { entries }),

  // Polls
  listPolls: (id: string) =>
    api.get<ApiResponse<PollDTO[]>>(`/sessions/${id}/polls`),
  createPoll: (id: string, body: { question: string; options: string[] }) =>
    api.post<ApiResponse<PollDTO>>(`/sessions/${id}/polls`, body),
  activatePoll: (id: string, pollId: string) =>
    api.post<ApiResponse<null>>(`/sessions/${id}/polls/${pollId}/activate`, {}),
  deactivatePoll: (id: string, pollId: string) =>
    api.post<ApiResponse<null>>(`/sessions/${id}/polls/${pollId}/deactivate`, {}),
  getPollResults: (id: string, pollId: string) =>
    api.get<ApiResponse<PollResultsDTO>>(`/sessions/${id}/polls/${pollId}/results`),
  vote: (id: string, pollId: string, option_index: number) =>
    api.post<ApiResponse<null>>(`/sessions/${id}/polls/${pollId}/vote`, { option_index }),

  // Action Items
  listActionItems: (id: string) =>
    api.get<ApiResponse<ActionItemDTO[]>>(`/sessions/${id}/action-items`),
  createActionItem: (id: string, body: { description: string; participant_id?: string; due_date?: string }) =>
    api.post<ApiResponse<ActionItemDTO>>(`/sessions/${id}/action-items`, body),
  updateActionItem: (id: string, itemId: string, body: { status?: string; description?: string }) =>
    api.patch<ApiResponse<null>>(`/sessions/${id}/action-items/${itemId}`, body),
};

// ── Submissions API ────────────────────────────────────────────────────────

export const submissionsApi = {
  list: (activity_id: string, page = 1) =>
    api.get<ApiResponse<SubmissionDTO[]>>(`/submissions?activity_id=${activity_id}&page=${page}`),
  get: (id: string) =>
    api.get<ApiResponse<SubmissionDTO>>(`/submissions/${id}`),
  grade: (id: string, body: { grade: number; feedback: string }) =>
    api.patch<ApiResponse<SubmissionDTO>>(`/submissions/${id}/grade`, body),
};

// ── Coaching extended types ────────────────────────────────────────────────

export interface CoachingParticipantDTO {
  user_id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

export interface CoachingTrackerDTO {
  participant_id: string;
  sessions_done: number;
  goals_set: number;
  actions_pending: number;
  follow_through_pct: number;
}

export interface CoachingKPIDTO {
  total_participants: number;
  sessions_done: number;
  actions_pending: number;
  avg_goal_progress_pct: number;
}

export interface GoalDTO {
  id: string;
  participant_id: string;
  faculty_id: string;
  title: string;
  description?: string;
  target_date?: string;
  status: "active" | "completed" | "dropped";
  pm_can_view: boolean;
  created_at: string;
  updated_at: string;
}

export interface DevNoteDTO {
  id: string;
  participant_id: string;
  faculty_id: string;
  content: string;
  pm_can_view: boolean;
  created_at: string;
  updated_at: string;
}

// ── Coaching API ───────────────────────────────────────────────────────────

export const coachingApi = {
  // Notes (existing)
  listBySession: (session_id: string, page = 1) =>
    api.get<ApiResponse<CoachingNoteDTO[]>>(`/coaching/notes?session_id=${session_id}&page=${page}`),
  listByParticipant: (participantId: string) =>
    api.get<ApiResponse<CoachingNoteDTO[]>>(`/coaching/notes/participant/${participantId}`),
  createNote: (body: { session_id: string; participant_id: string; notes: string; is_private: boolean }) =>
    api.post<ApiResponse<CoachingNoteDTO>>("/coaching/notes", body),
  updateNote: (id: string, body: { notes?: string; is_private?: boolean }) =>
    api.patch<ApiResponse<CoachingNoteDTO>>(`/coaching/notes/${id}`, body),

  // Roster & KPIs
  listParticipants: (cohort_id?: string) =>
    api.get<ApiResponse<CoachingParticipantDTO[]>>(`/coaching/participants${cohort_id ? "?cohort_id=" + cohort_id : ""}`),
  getKPI: (cohort_id?: string) =>
    api.get<ApiResponse<CoachingKPIDTO>>(`/coaching/kpi${cohort_id ? "?cohort_id=" + cohort_id : ""}`),
  getTracker: (participantId: string) =>
    api.get<ApiResponse<CoachingTrackerDTO>>(`/coaching/tracker?participant_id=${participantId}`),

  // Goals
  createGoal: (body: { participant_id: string; title: string; description?: string; target_date?: string; pm_can_view: boolean }) =>
    api.post<ApiResponse<GoalDTO>>("/coaching/goals", body),
  listGoals: (participantId: string) =>
    api.get<ApiResponse<GoalDTO[]>>(`/coaching/goals?participant_id=${participantId}`),
  updateGoal: (id: string, body: { title?: string; status?: string; pm_can_view?: boolean }) =>
    api.patch<ApiResponse<GoalDTO>>(`/coaching/goals/${id}`, body),
  deleteGoal: (id: string) =>
    api.delete<ApiResponse<null>>(`/coaching/goals/${id}`),

  // Dev notes
  createDevNote: (body: { participant_id: string; content: string; pm_can_view: boolean }) =>
    api.post<ApiResponse<DevNoteDTO>>("/coaching/dev-notes", body),
  listDevNotes: (participantId: string) =>
    api.get<ApiResponse<DevNoteDTO[]>>(`/coaching/dev-notes?participant_id=${participantId}`),
  updateDevNote: (id: string, body: { content?: string; pm_can_view?: boolean }) =>
    api.patch<ApiResponse<DevNoteDTO>>(`/coaching/dev-notes/${id}`, body),
};
