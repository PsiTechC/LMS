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
  program_id?: string;
  group_id?: string;
  sender_id: string;
  sender_name: string;
  recipient_id?: string; // absent for group messages
  body: string;
  is_read: boolean;
  created_at: string;
}

// One person a participant/PM is allowed to DM 1:1 (see backend
// listContactsService — no faculty are ever returned here).
export interface ContactDTO {
  user_id: string;
  name: string;
  email: string;
  avatar_url?: string;
  role: "program_manager" | "participant";
  program_id: string;
  program: string;
}

export interface DMGroupMemberDTO {
  user_id: string;
  name: string;
  joined_at: string;
}

export interface DMGroupDTO {
  id: string;
  program_id: string;
  program?: string;
  name: string;
  created_by: string;
  member_count: number;
  members?: DMGroupMemberDTO[];
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

  // Direct Messages — 1:1. Participant ⇄ their program manager(s), or
  // participant ⇄ participant sharing a program. No faculty involved.
  // Contacts and conversations are aggregated across ALL of a participant's
  // programs (program_id, when passed, only narrows the PM-side contact
  // list to one program they manage — 1:1 threads themselves are never
  // filtered by program, since two people can share more than one program).
  listDMContacts: (program_id?: string) => {
    const q = program_id ? `?program_id=${program_id}` : "";
    return api.get<ApiResponse<ContactDTO[]>>(`/discussions/dm/contacts${q}`);
  },

  listDMConversations: () =>
    api.get<ApiResponse<DirectMessageDTO[]>>("/discussions/dm"),

  listDMs: (userId: string) =>
    api.get<ApiResponse<DirectMessageDTO[]>>(`/discussions/dm/${userId}`),

  sendDM: (body: { recipient_id: string; program_id: string; cohort_id?: string; body: string }) =>
    api.post<ApiResponse<DirectMessageDTO>>("/discussions/dm", body),

  markDMsRead: (userId: string) =>
    api.patch<ApiResponse<null>>(`/discussions/dm/${userId}/read`, {}),

  // DM Groups — participant-created, participant-only membership.
  listMyDMGroups: () =>
    api.get<ApiResponse<DMGroupDTO[]>>("/discussions/dm/groups"),

  createDMGroup: (body: { program_id: string; name: string; member_ids?: string[] }) =>
    api.post<ApiResponse<DMGroupDTO>>("/discussions/dm/groups", body),

  getDMGroup: (groupId: string) =>
    api.get<ApiResponse<DMGroupDTO>>(`/discussions/dm/groups/${groupId}`),

  inviteToDMGroup: (groupId: string, member_ids: string[]) =>
    api.post<ApiResponse<null>>(`/discussions/dm/groups/${groupId}/invite`, { member_ids }),

  listGroupMessages: (groupId: string) =>
    api.get<ApiResponse<DirectMessageDTO[]>>(`/discussions/dm/groups/${groupId}/messages`),

  sendGroupMessage: (groupId: string, body: string) =>
    api.post<ApiResponse<DirectMessageDTO>>(`/discussions/dm/groups/${groupId}/messages`, { body }),

  // Announcements
  listAnnouncements: (cohort_id: string) =>
    api.get<ApiResponse<AnnouncementDTO[]>>(`/discussions/announcements?cohort_id=${cohort_id}`),

  createAnnouncement: (body: { cohort_id: string; title: string; body: string; send_email?: boolean }) =>
    api.post<ApiResponse<AnnouncementDTO>>("/discussions/announcements", body),

  deleteAnnouncement: (id: string) =>
    api.delete<ApiResponse<null>>(`/discussions/announcements/${id}`),
};