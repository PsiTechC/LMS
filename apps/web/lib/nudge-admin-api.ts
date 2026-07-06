import { api, ApiResponse } from "./api";

export interface AtRiskParticipant {
  user_id: string;
  name: string;
  email: string;
  org: string;
  org_id: string;
  program: string;
  cohort: string;
  cohort_id: string;
  risk_level: "high" | "medium";
  completion_percent: number;
  days_since_activity: number;
  nudged_at: string; // RFC3339 UTC, "" if never nudged
}

export const nudgeAdminApi = {
  atRisk: (orgId?: string) =>
    api.get<ApiResponse<AtRiskParticipant[]>>(
      `/communications/at-risk${orgId ? "?org_id=" + orgId : ""}`,
    ),
  nudge: (userId: string, cohortId?: string, message?: string) =>
    api.post<ApiResponse<null>>(`/communications/nudge`, {
      user_id: userId,
      cohort_id: cohortId ?? "",
      message: message ?? "",
    }),
};
