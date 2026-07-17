import { api, ApiResponse } from "./api";

// One row of the Billing page's Participants table — a user enrolled in an
// open (marketplace, self-enroll) program, paid or free.
export interface ParticipantEnrollmentDTO {
  user_id: string;
  name: string;
  email: string;
  program_title: string;
  start_date: string;      // YYYY-MM-DD — this participant's own enrolled_at
  end_date?: string;       // YYYY-MM-DD — completed_at, absent while still active
}

export const billingApi = {
  listParticipants: () =>
    api.get<ApiResponse<ParticipantEnrollmentDTO[]>>("/billing/participants"),
};
