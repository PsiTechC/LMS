import { api, ApiResponse } from "./api";

export interface InvitationDTO {
  id: string;
  cohort_id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "expired";
  expires_at: string;
  created_at: string;
}

export interface ValidateTokenDTO {
  email: string;
  role: string;
  cohort_id: string;
  org_id: string;
}

export const invitationsApi = {
  send: (body: { email: string; role: string; cohort_id: string }) =>
    api.post<ApiResponse<InvitationDTO | { message: string }>>("/invitations", body),

  // Org-level faculty invite — no cohort required
  sendFaculty: (body: { email: string; org_id: string }) =>
    api.post<ApiResponse<InvitationDTO | { message: string }>>("/invitations/faculty", body),

  listByCohort: (cohortId: string) =>
    api.get<ApiResponse<InvitationDTO[]>>(`/invitations/cohort/${cohortId}`),

  validate: (token: string) =>
    api.get<ApiResponse<ValidateTokenDTO>>(`/invitations/validate?token=${encodeURIComponent(token)}`),

  accept: (body: { token: string; name: string; password: string }) =>
    api.post<ApiResponse<{ message: string }>>("/invitations/accept", body),
};
