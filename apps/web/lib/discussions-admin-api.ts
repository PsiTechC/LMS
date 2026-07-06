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

export const discussionsAdminApi = {
  list: (orgId?: string) =>
    api.get<ApiResponse<AdminThreadDTO[]>>(
      `/discussions/admin${orgId ? "?org_id=" + orgId : ""}`,
    ),
  moderate: (id: string, action: ModerationAction) =>
    api.patch<ApiResponse<null>>(`/discussions/admin/threads/${id}/flag`, { action }),
};
