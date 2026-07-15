import { api, ApiResponse } from "./api";

export type SurveyType = "pre" | "mid" | "post" | "pulse" | "session";
export type QuestionType = "likert" | "nps" | "mcq" | "rating" | "open";

export interface SurveyCardDTO {
  activity_id: string;
  title: string;
  survey_type: SurveyType;
  is_anonymous: boolean;
  time_estimate_mins: number;
  question_count: number;
  status: "completed" | "active" | "upcoming";
  open_date?: string;
  due_date?: string;
  completed_date?: string;
}

export interface MySurveysDTO {
  has_program: boolean;
  total: number;
  completed: number;
  action_required: number;
  completion_rate: number;
  surveys: SurveyCardDTO[];
}

export interface QuestionDTO {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  answer_num?: number;
  answer_text?: string;
}

export interface SurveyDetailDTO {
  activity_id: string;
  title: string;
  survey_type: SurveyType;
  is_anonymous: boolean;
  time_estimate_mins: number;
  completed: boolean;
  questions: QuestionDTO[];
}

export interface AnswerInput {
  question_id: string;
  num?: number;
  text?: string;
}

export const surveysApi = {
  // programId scopes the list to the program the switcher is on, so a
  // participant enrolled in multiple programs sees the correct surveys.
  my: (programId?: string) =>
    api.get<ApiResponse<MySurveysDTO>>(`/surveys/my${programId ? `?program_id=${programId}` : ""}`),

  detail: (activityId: string) =>
    api.get<ApiResponse<SurveyDetailDTO>>(`/surveys/${activityId}`),

  // AI Survey Insights — one-line card on the participant's Surveys tab.
  // On-demand (LLM call), fetched on page load.
  aiInsight: () =>
    api.post<ApiResponse<{ insight: string }>>(`/surveys/ai_insight`, {}),

  submit: (activityId: string, answers: AnswerInput[]) =>
    api.post<ApiResponse<MySurveysDTO>>("/surveys/submit", { activity_id: activityId, answers }),
};
