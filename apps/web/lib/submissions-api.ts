import { api, ApiResponse } from "./api";

export interface SubmissionDTO {
  id: string;
  activity_id: string;
  participant_id: string;
  content?: string;
  file_url?: string;
  status: string;
  grade?: number;
  feedback?: string;
  graded_by?: string;
  submitted_at: string;
}

export const submissionsApi = {
  my: (activityId: string) =>
    api.get<ApiResponse<SubmissionDTO>>(`/submissions/my?activity_id=${activityId}`),

  submit: (body: { activity_id: string; content?: string; file_url?: string }) =>
    api.post<ApiResponse<SubmissionDTO>>("/submissions", body),
};
