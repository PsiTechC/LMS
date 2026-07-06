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
  name: string;
  department: string;
}

export const invitationsApi = {
  // cohort_id optional — pass program_id + org_id to enroll to the program's
  // default "Unassigned" cohort (cohort assigned later via Cohort Management).
  send: (body: { email: string; role: string; cohort_id?: string; program_id?: string; org_id?: string; name: string; department: string }) =>
    api.post<ApiResponse<InvitationDTO | { message: string }>>("/invitations", body),

  // Org-level faculty invite — no cohort required. Optional name/role prefill
  // the accept form (name stays editable there); role defaults to faculty.
  sendFaculty: (body: { email: string; org_id: string; name?: string; role?: string }) =>
    api.post<ApiResponse<InvitationDTO | { message: string }>>("/invitations/faculty", body),

  listByCohort: (cohortId: string) =>
    api.get<ApiResponse<InvitationDTO[]>>(`/invitations/cohort/${cohortId}`),

  validate: (token: string) =>
    api.get<ApiResponse<ValidateTokenDTO>>(`/invitations/validate?token=${encodeURIComponent(token)}`),

  accept: (body: { token: string; password: string; name?: string }) =>
    api.post<ApiResponse<{ message: string }>>("/invitations/accept", body),
};
