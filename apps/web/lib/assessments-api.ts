import { api, ApiResponse } from "./api";

export type QuestionType = "mcq" | "true_false" | "matching" | "open";

export interface AssessmentCardDTO {
  activity_id: string;
  title: string;
  question_count: number;
  time_limit_mins: number;
  attempts_allowed: number;
  attempts_used: number;
  passing_score_pct: number;
  status: "completed" | "active" | "upcoming";
  best_score_pct?: number;
  passed?: boolean;
  pending_review: boolean; // an attempt awaits faculty grading of open questions
  due_date?: string;
}

export interface MyAssessmentsDTO {
  has_program: boolean;
  total: number;
  completed: number;
  graded: number;
  avg_score?: number;
  assessments: AssessmentCardDTO[];
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
  // Timed assessments only: started_at anchors the countdown server-side
  // (stable across refresh); server_now lets the client compute remaining time
  // without trusting its own clock. Both absent for untimed assessments.
  started_at?: string;
  server_now?: string;
  questions: QuestionDTO[];
}

export interface AnswerInput {
  question_id: string;
  index?: number;
  text?: string;
  // matching: maps each left item (by its index) to the chosen right-item text.
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
  is_correct?: boolean; // undefined for "open" (ungraded)
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
  // auto_scored (final now) | pending_review (open Qs await faculty) | graded.
  status: "auto_scored" | "pending_review" | "graded";
  timed_out: boolean;
  attempt_number: number;
  attempts_left: number;
  questions: QuestionResultDTO[];
}

// Lightweight, type-agnostic "where do I stand" summary - unlike detail()
// this never errors once attempts are exhausted, so it's what shows an
// attached Knowledge Check's result after it's been taken/graded.
export interface AssessmentStatusDTO {
  activity_id: string;
  attempts_allowed: number;
  attempts_used: number;
  best_score_pct?: number;
  passed?: boolean;
  pending_review: boolean;
  last_status?: "auto_scored" | "pending_review" | "graded";
}

export const assessmentsApi = {
  // programId scopes the list to the program the switcher is on, so a
  // participant enrolled in multiple programs sees the correct assessments.
  my: (programId?: string) =>
    api.get<ApiResponse<MyAssessmentsDTO>>(`/assessments/my${programId ? `?program_id=${programId}` : ""}`),

  detail: (activityId: string) =>
    api.get<ApiResponse<AssessmentDetailDTO>>(`/assessments/${activityId}`),

  status: (activityId: string) =>
    api.get<ApiResponse<AssessmentStatusDTO>>(`/assessments/${activityId}/status`),

  submit: (activityId: string, answers: AnswerInput[]) =>
    api.post<ApiResponse<AssessmentResultDTO>>("/assessments/submit", { activity_id: activityId, answers }),
};
