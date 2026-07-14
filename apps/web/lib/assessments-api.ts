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
  questions: QuestionDTO[];
}

export interface AnswerInput {
  question_id: string;
  index?: number;
  text?: string;
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
  attempt_number: number;
  attempts_left: number;
  questions: QuestionResultDTO[];
}

export const assessmentsApi = {
  // programId scopes the list to the program the switcher is on, so a
  // participant enrolled in multiple programs sees the correct assessments.
  my: (programId?: string) =>
    api.get<ApiResponse<MyAssessmentsDTO>>(`/assessments/my${programId ? `?program_id=${programId}` : ""}`),

  detail: (activityId: string) =>
    api.get<ApiResponse<AssessmentDetailDTO>>(`/assessments/${activityId}`),

  submit: (activityId: string, answers: AnswerInput[]) =>
    api.post<ApiResponse<AssessmentResultDTO>>("/assessments/submit", { activity_id: activityId, answers }),
};
