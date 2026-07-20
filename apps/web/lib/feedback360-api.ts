import { api, ApiResponse, BASE_URL } from "./api";

export interface CompetencyScoreDTO {
  competency_id: string;
  title: string;
  self_score?: number;
  others_score?: number;
  gap?: number;
}

export interface RaterDTO {
  id: string;
  name: string;
  email: string;
  relationship: "manager" | "peer" | "direct_report" | "skip_level" | "others";
  status: "pending" | "submitted";
  reminded_at?: string;
  submitted_at?: string;
}

export interface QuorumDTO {
  relationship: "manager" | "peer" | "direct_report" | "skip_level" | "others";
  /** Participant-facing name. Equals the category's default name except for
   *  "others", which carries the admin's chosen label (e.g. "Customers"). */
  label: string;
  min: number;
  nominated: number;
  submitted: number;
  met: boolean;
}

// SelfRaterDTO tells the participant whether they've completed their own
// self-rating yet, and carries the token their in-app "Rate Yourself" button
// links to (the same public /rater/{token} form every other rater uses).
export interface SelfRaterDTO {
  invite_token: string;
  status: "pending" | "submitted";
}

export interface CycleDTO {
  id: string;
  title: string;
  cycle_type: string;
  status: "draft" | "open" | "closed";
  deadline?: string;
  ai_summary?: string;
  raters_invited: number;
  raters_submitted: number;
  raters: RaterDTO[];
  competencies: CompetencyScoreDTO[];
  quorum: QuorumDTO[];
  self_rater?: SelfRaterDTO;
  created_at: string;
}

export interface CreateCyclePayload {
  title?: string;
  cycle_type?: string;
  program_id?: string;
  cohort_id?: string;
  deadline?: string;
  competency_ids?: string[];
}

export interface AddRaterPayload {
  name: string;
  email: string;
  relationship: "manager" | "peer" | "direct_report" | "skip_level" | "others";
}

export const feedback360Api = {
  // Participant: their latest cycle (404 if none yet). programId scopes to the
  // program the switcher is on (falls back to latest overall when none there).
  myCycle: (programId?: string) =>
    api.get<ApiResponse<CycleDTO>>(`/feedback_360/my${programId ? `?program_id=${programId}` : ""}`),

  // Generates a real AI narrative from the caller's own submitted scores +
  // open-text rater comments. On-demand (LLM call) - not fetched automatically.
  generateAISummary: () =>
    api.post<ApiResponse<{ summary: string }>>("/feedback_360/my/ai-summary", {}),

  createCycle: (body: CreateCyclePayload) =>
    api.post<ApiResponse<CycleDTO>>("/feedback_360/cycles", body),

  addRater: (cycleId: string, body: AddRaterPayload) =>
    api.post<ApiResponse<CycleDTO>>(`/feedback_360/cycles/${cycleId}/raters`, body),

  removeRater: (cycleId: string, raterId: string) =>
    api.delete<ApiResponse<CycleDTO>>(`/feedback_360/cycles/${cycleId}/raters/${raterId}`),

  remindRater: (cycleId: string, raterId: string) =>
    api.post<ApiResponse<CycleDTO>>(`/feedback_360/cycles/${cycleId}/raters/${raterId}/remind`, {}),
};

export class ReportNotReadyError extends Error {}

// downloadReport fetches the participant's PDF report and triggers a browser
// download. A plain fetch (not the JSON `api` client) since the response body
// is a binary blob, not JSON - but the auth header still has to be attached by
// hand since this bypasses that client.
export async function downloadReport(programId?: string): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("xa_token") : null;
  const res = await fetch(`${BASE_URL}/feedback_360/my/report${programId ? `?program_id=${programId}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (res.status === 409) {
    throw new ReportNotReadyError("Your report isn't ready yet - all required raters and your self-rating need to be submitted first.");
  }
  if (!res.ok) {
    throw new Error("Failed to generate report");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "360-feedback-report.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
