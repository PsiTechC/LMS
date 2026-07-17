import { api, ApiResponse } from "./api";

export interface AdminThreadDTO {
  id: string;
  title: string;
  program: string;
  program_id: string;
  org: string;
  org_id: string;
  author: string;
  replies: number;
  views: number;
  status: "active" | "flagged" | "pinned";
  last_activity: string; // RFC3339 (UTC)
}

export type ModerationAction = "pin" | "unpin" | "flag" | "unflag" | "delete";
export type ThreadStatus = "flagged" | "pinned" | "active";

export const discussionsAdminApi = {
  list: (orgId?: string, status?: ThreadStatus, page = 1, perPage = 20) => {
    const p = new URLSearchParams();
    if (orgId) p.set("org_id", orgId);
    if (status) p.set("status", status);
    p.set("page", String(page));
    p.set("per_page", String(perPage));
    return api.get<ApiResponse<AdminThreadDTO[]>>(`/discussions/admin?${p.toString()}`);
  },
  moderate: (id: string, action: ModerationAction) =>
    api.patch<ApiResponse<null>>(`/discussions/admin/threads/${id}/flag`, { action }),
};
