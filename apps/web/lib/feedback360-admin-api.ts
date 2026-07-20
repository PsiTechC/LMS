import { api, ApiResponse } from "./api";

export interface Breakdown360 {
  self: number | null;
  manager: number | null;
  peer: number | null;
  direct_report: number | null;
}

export interface CompScore360 {
  competency_id: string;
  title: string;
  score: number;
}

export interface AdminCycle360 {
  cycle_id: string;
  // Together with cycle_id, uniquely identifies one completed panel - an
  // admin-initiated cycle can carry many participants sharing one cycle_id.
  participant_id: string;
  title: string;
  cycle_type: string;
  participant: string;
  org: string;
  org_id: string;
  program: string;
  completed_at: string;
  overall_score: number | null;
  breakdown: Breakdown360;
  competencies: CompScore360[];
}

export const feedback360AdminApi = {
  list: (orgId?: string) =>
    api.get<ApiResponse<AdminCycle360[]>>(
      `/feedback_360/admin${orgId ? "?org_id=" + orgId : ""}`,
    ),
};
