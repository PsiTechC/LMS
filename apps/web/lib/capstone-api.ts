import { api, ApiResponse } from "./api";

export interface TeamMemberDTO {
  user_id: string;
  name: string;
  email: string;
  department?: string;
  is_me: boolean;
}

export interface TeamFileDTO {
  id: string;
  title: string;
  file_url: string;
  uploaded_by_id?: string;
  uploaded_by?: string;
  created_at: string;
}

export interface PeerAssignmentDTO {
  assignment_id: string;
  target_team: string;
  due_date?: string;
  reviewed: boolean;
  my_rating?: number;
}

export interface PanelFeedbackDTO {
  panelist_name: string;
  panelist_role?: string;
  rating: number;
  comment?: string;
  created_at: string;
}

export interface MyCapstoneDTO {
  has_team: boolean;
  team_id?: string;
  title?: string;
  team_name?: string;
  program_name?: string;
  cohort_name?: string;
  description?: string;
  format?: string;
  audience?: string;
  evaluation?: string;
  deadline?: string;
  submission_status: "not_submitted" | "submitted";
  file_url?: string;
  file_name?: string;
  submitted_at?: string;
  ai_feedback?: string;
  members: TeamMemberDTO[];
  files: TeamFileDTO[];
  peer_assignments: PeerAssignmentDTO[];
  panel_released: boolean;
  panel: PanelFeedbackDTO[];
  panel_avg?: number;
}

export const capstoneApi = {
  my: () => api.get<ApiResponse<MyCapstoneDTO>>("/capstone/my"),

  submit: (body: { file_url: string; file_name: string }) =>
    api.post<ApiResponse<MyCapstoneDTO>>("/capstone/submit", body),

  addFile: (body: { title: string; file_url: string }) =>
    api.post<ApiResponse<MyCapstoneDTO>>("/capstone/files", body),

  submitPeerReview: (body: { assignment_id: string; rating: number; comment: string }) =>
    api.post<ApiResponse<MyCapstoneDTO>>("/capstone/peer-reviews", body),
};
