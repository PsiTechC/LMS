import { api, ApiResponse } from "./api";

export interface AdminLeaderRow {
  rank: number;
  user_id: string;
  participant: string;
  org: string;
  org_id: string;
  program: string;
  points: number;
  streak: number;
  progress: number;      // program completion %
  change: number | null; // null - no historical snapshot stored
}

export interface AdminOrgRow {
  rank: number;
  org: string;
  org_id: string;
  participants: number;
  total_points: number;
  avg_points: number;
  avg_progress: number;
}

export interface AdminLeaderboardDTO {
  participants: AdminLeaderRow[];
  organizations: AdminOrgRow[];
}

export const leaderboardAdminApi = {
  get: (orgId?: string) =>
    api.get<ApiResponse<AdminLeaderboardDTO>>(`/leaderboard/admin${orgId ? "?org_id=" + orgId : ""}`),
};
