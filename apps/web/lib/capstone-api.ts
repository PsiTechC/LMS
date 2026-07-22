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
  visibility: "personal" | "public";
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

// ── Authoring-layer shared shapes ───────────────────────────────────────────
export interface RubricCriterion {
  criterion: string;
  weight: number;
}
export interface ResourceLink {
  title: string;
  url: string;
}
export interface ReferenceFile {
  title: string;
  content_id: string;
}
export interface CriterionScore {
  criterion: string;
  score: number;
}
export interface MilestoneDTO {
  id: string;
  title: string;
  due_date?: string;
  status: "upcoming" | "open" | "overdue" | "done";
  sort_order: number;
}
export interface ParticipantGrade {
  score: number;
  per_criterion: CriterionScore[];
  comments?: string;
  is_individual: boolean;
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

  // Authored config brief
  theme?: string;
  problem_statement?: string;
  objectives?: string;
  deliverable_format?: string[];
  rubric?: RubricCriterion[];
  resources?: ResourceLink[];
  reference_files?: ReferenceFile[];
  team_structure?: "individual" | "group";
  passing_threshold?: number;
  is_individual: boolean;

  // Milestones + completion + released grade
  milestones: MilestoneDTO[];
  completion_status: "in_progress" | "complete";
  grade_released: boolean;
  my_grade?: ParticipantGrade;

  members: TeamMemberDTO[];
  files: TeamFileDTO[];
  peer_assignments: PeerAssignmentDTO[];
  panel_released: boolean;
  panel: PanelFeedbackDTO[];
  panel_avg?: number;
}

export const capstoneApi = {
  // programId scopes to the program the switcher is on (multi-program participants).
  my: (programId?: string) =>
    api.get<ApiResponse<MyCapstoneDTO>>(`/capstone/my${programId ? `?program_id=${programId}` : ""}`),

  submit: (body: { file_url: string; file_name: string }, programId?: string) =>
    api.post<ApiResponse<MyCapstoneDTO>>(`/capstone/submit${programId ? `?program_id=${programId}` : ""}`, body),

  addFile: (body: { title: string; file_url: string; visibility?: "personal" | "public" }, programId?: string) =>
    api.post<ApiResponse<MyCapstoneDTO>>(`/capstone/files${programId ? `?program_id=${programId}` : ""}`, body),

  submitPeerReview: (body: { assignment_id: string; rating: number; comment: string }, programId?: string) =>
    api.post<ApiResponse<MyCapstoneDTO>>(`/capstone/peer-reviews${programId ? `?program_id=${programId}` : ""}`, body),
};

// ── Management (SA/PM/Faculty) ──────────────────────────────────────────────

export interface ConfigDTO {
  id: string;
  org_id: string;
  org?: string;
  program_id: string;
  program?: string;
  phase_id?: string;
  activity_id?: string;
  title: string;
  theme?: string;
  problem_statement?: string;
  objectives?: string;
  deliverable_format: string[];
  rubric: RubricCriterion[];
  resources: ResourceLink[];
  reference_files: ReferenceFile[];
  team_structure: "individual" | "group";
  passing_threshold: number;
  deadline?: string;
  status: "draft" | "assigned" | "closed";
  team_count: number;
  created_at: string;
}

export interface ManagedMemberDTO {
  user_id: string;
  name: string;
  email: string;
}

export interface ManagedGradeDTO {
  team_id: string;
  participant_id?: string;
  score: number;
  per_criterion: CriterionScore[];
  comments?: string;
  released: boolean;
  graded_at: string;
}

export interface ManagedTeamDTO {
  team_id: string;
  name: string;
  is_individual: boolean;
  members: ManagedMemberDTO[];
  submission_status: string;
  file_url?: string;
  file_name?: string;
  submitted_at?: string;
  completion_status: "in_progress" | "complete";
  team_grade?: ManagedGradeDTO;
  member_grades?: ManagedGradeDTO[];
}

export interface ConfigDetailDTO {
  config: ConfigDTO;
  milestones: MilestoneDTO[];
  teams: ManagedTeamDTO[];
}

export interface UpdateConfigBody {
  title?: string;
  theme?: string;
  problem_statement?: string;
  objectives?: string;
  deliverable_format?: string[];
  rubric?: RubricCriterion[];
  resources?: ResourceLink[];
  reference_files?: ReferenceFile[];
  team_structure?: "individual" | "group";
  passing_threshold?: number;
  deadline?: string;
}

export const capstoneManageApi = {
  // SA: omit org to see all orgs, or pass org_id to filter. PM/Faculty auto-scoped.
  list: (orgId?: string) =>
    api.get<ApiResponse<ConfigDTO[]>>(`/capstone/configs${orgId ? `?org_id=${orgId}` : ""}`),
  get: (id: string) =>
    api.get<ApiResponse<ConfigDetailDTO>>(`/capstone/configs/${id}`),
  create: (body: { program_id: string; phase_id?: string; activity_id?: string; title?: string }) =>
    api.post<ApiResponse<ConfigDTO>>(`/capstone/configs`, body),
  update: (id: string, body: UpdateConfigBody) =>
    api.patch<ApiResponse<null>>(`/capstone/configs/${id}`, body),
  remove: (id: string) =>
    api.delete<ApiResponse<null>>(`/capstone/configs/${id}`),
  assign: (id: string, body: { cohort_id: string; group_ids?: string[] }) =>
    api.post<ApiResponse<{ assigned_teams: number; status: string }>>(`/capstone/configs/${id}/assign`, body),

  addMilestone: (id: string, body: { title: string; due_date?: string }) =>
    api.post<ApiResponse<MilestoneDTO>>(`/capstone/configs/${id}/milestones`, body),
  updateMilestone: (id: string, milestoneId: string, body: { title?: string; due_date?: string }, status?: string) =>
    api.patch<ApiResponse<null>>(`/capstone/configs/${id}/milestones/${milestoneId}${status ? `?status=${status}` : ""}`, body),
  deleteMilestone: (id: string, milestoneId: string) =>
    api.delete<ApiResponse<null>>(`/capstone/configs/${id}/milestones/${milestoneId}`),

  grade: (id: string, body: { team_id: string; participant_id?: string; score: number; per_criterion?: CriterionScore[]; comments?: string }) =>
    api.post<ApiResponse<{ saved: boolean; auto_released: boolean }>>(`/capstone/configs/${id}/grades`, body),
  release: (id: string) =>
    api.post<ApiResponse<{ released: boolean; notified: number }>>(`/capstone/configs/${id}/release`, {}),
};
