import { api, ApiResponse } from "./api";

export interface GradingAdminDTO {
  id: string;
  source: "submission" | "capstone";
  type: string;         // Assignment | Reflection | Assessment | Case Study | Capstone
  participant: string;
  org: string;
  org_id: string;
  program: string;
  title: string;
  submitted_at: string; // RFC3339 UTC, "" if not submitted
  faculty: string;      // grader name, "" if none
  status: string;       // submitted | graded | not_submitted | …
  grade?: number;
}

export type GradingStatus = "pending" | "graded" | "capstone";

export const gradingAdminApi = {
  list: (orgId?: string, status?: GradingStatus) => {
    const p = new URLSearchParams();
    if (orgId) p.set("org_id", orgId);
    if (status) p.set("status", status);
    const qs = p.toString();
    return api.get<ApiResponse<GradingAdminDTO[]>>(`/grading/admin${qs ? "?" + qs : ""}`);
  },
};
