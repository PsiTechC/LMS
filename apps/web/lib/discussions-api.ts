import { api, ApiResponse } from "./api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ReplyDTO {
  id: string;
  thread_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface ThreadDTO {
  id: string;
  cohort_id: string;
  program_id: string;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  category: string;
  tags: string[];
  is_pinned: boolean;
  reply_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  replies?: ReplyDTO[];
}

export interface DirectMessageDTO {
  id: string;
  cohort_id?: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface AnnouncementDTO {
  id: string;
  cohort_id: string;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  send_email: boolean;
  created_at: string;
}

// ── Discussions API ────────────────────────────────────────────────────────

export const discussionsApi = {
  // Threads — pass program_id for program-wide (all cohorts) listing, or
  // cohort_id for a single cohort.
  listThreads: (params: { cohort_id?: string; program_id?: string; category?: string; search?: string; page?: number; per_page?: number }) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string>
    ).toString();
    return api.get<ApiResponse<ThreadDTO[]>>(`/discussions/threads?${q}`);
  },

  createThread: (body: { cohort_id: string; program_id: string; title: string; body: string; category?: string; tags?: string[] }) =>
    api.post<ApiResponse<ThreadDTO>>("/discussions/threads", body),

  getThread: (id: string) =>
    api.get<ApiResponse<ThreadDTO>>(`/discussions/threads/${id}`),

  deleteThread: (id: string) =>
    api.delete<ApiResponse<null>>(`/discussions/threads/${id}`),

  pinThread: (id: string) =>
    api.post<ApiResponse<null>>(`/discussions/threads/${id}/pin`, {}),

  createReply: (threadId: string, body: string) =>
    api.post<ApiResponse<ReplyDTO>>(`/discussions/threads/${threadId}/replies`, { body }),

  deleteReply: (threadId: string, replyId: string) =>
    api.delete<ApiResponse<null>>(`/discussions/threads/${threadId}/replies/${replyId}`),

  // Direct Messages
  listDMConversations: (cohort_id?: string) => {
    const q = cohort_id ? `?cohort_id=${cohort_id}` : "";
    return api.get<ApiResponse<DirectMessageDTO[]>>(`/discussions/dm${q}`);
  },

  listDMs: (userId: string) =>
    api.get<ApiResponse<DirectMessageDTO[]>>(`/discussions/dm/${userId}`),

  sendDM: (body: { recipient_id: string; cohort_id?: string; body: string }) =>
    api.post<ApiResponse<DirectMessageDTO>>("/discussions/dm", body),

  markDMsRead: (userId: string) =>
    api.patch<ApiResponse<null>>(`/discussions/dm/${userId}/read`, {}),

  // Announcements
  listAnnouncements: (cohort_id: string) =>
    api.get<ApiResponse<AnnouncementDTO[]>>(`/discussions/announcements?cohort_id=${cohort_id}`),

  createAnnouncement: (body: { cohort_id: string; title: string; body: string; send_email?: boolean }) =>
    api.post<ApiResponse<AnnouncementDTO>>("/discussions/announcements", body),

  deleteAnnouncement: (id: string) =>
    api.delete<ApiResponse<null>>(`/discussions/announcements/${id}`),
};