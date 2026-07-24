/**
 * Types mirroring the real backend contract (api/internal/auth/dto.go) and
 * the web client's equivalents (apps/web/lib/api.ts, lib/auth-context.tsx).
 * Do not diverge from these shapes — extend the backend DTO first if a
 * mobile screen needs a field that doesn't exist yet, and document the gap
 * instead of inventing a shape client-side.
 */

// Every backend response is wrapped in this envelope (CLAUDE.md "Standard
// Response Envelope").
export interface ApiResponse<T> {
  data: T;
  meta?: { page: number; per_page: number; total: number };
  error: null | { code: string; message: string; field?: string };
}

// Role enum matches api/internal/shared/rbac.go Role* constants exactly.
export type UserRole =
  | 'superadmin'
  | 'superadmin_secondary'
  | 'program_manager'
  | 'faculty'
  | 'coach'
  | 'participant'
  | 'participant_retailer';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url: string | null;
  org_id: string | null;
  // UI-facing only — never used for authorization (server always re-derives
  // access via rbac.Resolve). See api/internal/auth/dto.go UserDTO comment.
  secondary_roles?: string[];
  is_verified?: boolean;
}

export interface LoginResponse {
  access_token: string;
  user: UserDTO;
}

// ---------------------------------------------------------------------------
// Participant domain types — mirror apps/web/lib/{cohorts,programs,sessions,
// submissions,attendance,profile}-api.ts exactly. Do not diverge from these
// shapes; extend the backend DTO first if a mobile screen needs a field that
// doesn't exist yet.
// ---------------------------------------------------------------------------

export interface MyEnrollmentDTO {
  enrollment_id: string;
  cohort_id: string;
  cohort_name: string;
  cohort_start_date?: string;
  cohort_end_date?: string;
  role: string;
  status: string;
  completion_percent: number;
  risk_level: 'low' | 'medium' | 'high';
  enrolled_at: string;
  program_id: string;
  program_title: string;
  program_description?: string;
  program_color: string;
  program_duration_weeks: number;
  program_status: string;
}

export interface ActivityConfig {
  asset_id?: string;
  attempts_allowed?: number;
  time_limit_mins?: number;
  cooling_off_hours?: number;
  scoring_method?: 'highest' | 'latest' | 'average';
  passing_score_pct?: number;
  is_anonymous?: boolean;
  level?: 'l1' | 'l2' | 'l3' | 'l4' | '';
  external_link_enabled?: boolean;
  session_type?: string;
  prompt?: string;
  instructions?: string;
  allow_late_submit?: boolean;
  reviewers_per_submission?: number;
  knowledge_check?: {
    asset_id?: string;
    time_limit_mins?: number;
    attempts_allowed?: number;
    passing_score_pct?: number;
  };
}

export interface ActivityDTO {
  id: string;
  phase_id: string;
  module_id?: string;
  slot?: '' | 'pre' | 'post';
  title: string;
  description?: string;
  type: string;
  delivery_mode: string;
  sort_order: number;
  duration_mins: number;
  due_day_offset: number;
  start_day: number;
  duration_days: number;
  is_mandatory: boolean;
  config?: ActivityConfig;
  locked?: boolean;
  locked_reason?: string;
  completed?: boolean;
}

export interface ModuleDTO {
  id: string;
  phase_id: string;
  title: string;
  delivery_mode: 'virtual' | 'in-person';
  session_date?: string;
  sort_order: number;
  pre: ActivityDTO[];
  post: ActivityDTO[];
}

export type PhaseType =
  | 'pre-enrolment'
  | 'orientation'
  | 'module-virtual'
  | 'module-in-person'
  | 'coaching'
  | 'capstone'
  | 'post-program'
  | 'custom';

export interface PhaseDTO {
  id: string;
  program_id: string;
  title: string;
  description?: string;
  phase_number: number;
  week_label?: string;
  color: string;
  start_day: number;
  end_day: number;
  phase_type: PhaseType;
  delivery_mode?: '' | 'virtual' | 'in-person';
  modules: ModuleDTO[];
  activities: ActivityDTO[];
  locked?: boolean;
  locked_reason?: string;
}

export interface ProgramDTO {
  id: string;
  org_id: string;
  title: string;
  description?: string;
  status: 'draft' | 'active' | 'upcoming' | 'delivered' | 'archived';
  color: string;
  is_open?: boolean;
  payment_required: boolean;
  price_amount: number;
  currency: string;
  gst_inclusive: boolean;
  gst_rate_bps: number;
  duration_weeks: number;
  start_date?: string;
  end_date?: string;
  published_at?: string;
  phase_count: number;
  activity_count: number;
  enrolled_count: number;
  avg_completion: number;
  created_at: string;
}

export interface ProgramDetailDTO extends ProgramDTO {
  phases: PhaseDTO[];
}

export interface ProgramMaterialDTO {
  id: string;
  program_id: string;
  uploaded_by: string;
  title: string;
  type: string;
  url: string;
  size_bytes?: number;
  created_at: string;
}

export interface AgendaItem {
  time?: string;
  title: string;
  description?: string;
}

export interface SessionDTO {
  id: string;
  program_id: string;
  cohort_id: string;
  activity_id?: string;
  faculty_id: string;
  faculty_name?: string;
  title: string;
  description?: string;
  session_type: string;
  virtual_link?: string;
  meeting_type?: string;
  join_url?: string;
  whiteboard_url?: string;
  scheduled_at: string;
  duration_mins: number;
  status: string;
  agenda: AgendaItem[];
  notes?: string;
  reminder_enabled: boolean;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

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

export interface StartSessionResponse {
  attendance_session_id: string;
  code: string;
  join_url: string;
  qr_payload: string;
}

export interface CheckInResponse {
  status: string;
  checked_in_at: string;
  already_checked_in: boolean;
  class_session_title: string;
}

export interface MyCheckInStatusDTO {
  checked_in: boolean;
  checked_in_at?: string;
}

// ---------------------------------------------------------------------------
// Assessments (quiz-taking) — mirror api/internal/assessments/dto.go exactly.
// Only "mcq" | "true_false" | "matching" | "open" are real question types;
// do not invent others. Note: the web client (apps/web/lib/assessments-api.ts)
// declares an optional `section` field on QuestionDTO/QuestionResultDTO, but
// the Go DTO never actually marshals one — it is always absent on the wire,
// so it is deliberately omitted here rather than carried over unused.
// ---------------------------------------------------------------------------

export type QuestionType = 'mcq' | 'true_false' | 'matching' | 'open';

export interface AssessmentCardDTO {
  activity_id: string;
  title: string;
  question_count: number;
  time_limit_mins: number;
  attempts_allowed: number;
  attempts_used: number;
  passing_score_pct: number;
  status: 'completed' | 'active' | 'upcoming';
  best_score_pct?: number;
  passed?: boolean;
  pending_review: boolean;
  due_date?: string;
  locked?: boolean;
  locked_reason?: string;
}

export interface MyAssessmentsDTO {
  has_program: boolean;
  total: number;
  completed: number;
  graded: number;
  avg_score?: number;
  assessments: AssessmentCardDTO[];
}

export interface AssessmentStatusDTO {
  activity_id: string;
  attempts_allowed: number;
  attempts_used: number;
  best_score_pct?: number;
  passed?: boolean;
  pending_review: boolean;
  last_status?: 'auto_scored' | 'pending_review' | 'graded';
}

export interface MatchPair {
  left: string;
  right: string;
}

export interface QuestionDTO {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  match_pairs?: MatchPair[];
  points: number;
}

export interface AssessmentDetailDTO {
  activity_id: string;
  title: string;
  time_limit_mins: number;
  attempts_allowed: number;
  attempts_used: number;
  passing_score_pct: number;
  // Timed assessments only: started_at anchors the countdown server-side;
  // server_now lets the client correct for clock skew. Both absent when
  // untimed (time_limit_mins === 0).
  started_at?: string;
  server_now?: string;
  questions: QuestionDTO[];
}

export interface AnswerInput {
  question_id: string;
  index?: number;
  text?: string;
  // matching: "leftIndex" (stringified) -> chosen right-item text.
  matches?: Record<string, string>;
}

export interface QuestionResultDTO {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  selected_index?: number;
  selected_text?: string;
  correct_index?: number;
  correct_text?: string;
  is_correct?: boolean; // undefined for "open" (faculty-graded, ungraded yet)
  points: number;
  points_earned: number;
}

export interface AssessmentResultDTO {
  activity_id: string;
  title: string;
  score: number;
  max_score: number;
  score_pct: number;
  passed: boolean;
  status: 'auto_scored' | 'pending_review' | 'graded';
  timed_out: boolean;
  attempt_number: number;
  attempts_left: number;
  questions: QuestionResultDTO[];
}

export interface ProfileResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar_url: string | null;
  mobile_number: string;
  about: string;
  created_at: string;
}
