import { api, ApiResponse } from "./api";

export interface AdminSurveyDTO {
  activity_id: string;
  title: string;
  program: string;
  program_id: string;
  org: string;
  org_id: string;
  survey_type: string;     // pre | mid | post | pulse | session
  responses: number;       // completions
  total_enrolled: number;
  faculty: number;         // faculty enrolled in the program
  cohorts: number;         // cohort count in the program
  completion: number;      // response rate %
  avg_score: number;
  status: "active" | "closed";
  close_date?: string;     // YYYY-MM-DD
}

export interface DistBucket {
  label: string;
  value: number;
  count: number;
}

export interface QuestionResultDTO {
  id: string;
  type: "likert" | "nps" | "mcq" | "rating" | "open";
  text: string;
  response_count: number;
  average?: number;
  distribution?: DistBucket[];
  text_answers?: string[];
}

export interface RosterEntry {
  name: string;
  email: string;
  cohort: string;
  responded: boolean;
}

export interface SurveyResultsDTO {
  activity_id: string;
  title: string;
  program: string;
  org: string;
  survey_type: string;
  total_enrolled: number;
  responses: number;
  completion: number;
  faculty: string[];
  roster: RosterEntry[];
  questions: QuestionResultDTO[];
}

export interface RemindResponse {
  sent: number;
}

// Survey Sentiment Analysis - one open-text answer auto-tagged by
// sentiment/urgency/theme. Computed on demand (not part of SurveyResultsDTO)
// since it's an LLM call per answer.
export interface OpenAnswerSentimentDTO {
  text: string;
  sentiment?: "positive" | "neutral" | "negative";
  urgency?: "low" | "medium" | "high";
  theme?: string;
}

export const surveysAdminApi = {
  list: (orgId?: string) =>
    api.get<ApiResponse<AdminSurveyDTO[]>>(`/surveys/admin${orgId ? "?org_id=" + orgId : ""}`),
  results: (activityId: string) =>
    api.get<ApiResponse<SurveyResultsDTO>>(`/surveys/admin/${activityId}/results`),
  remind: (activityId: string, title?: string, body?: string) =>
    api.post<ApiResponse<RemindResponse>>(`/surveys/admin/${activityId}/remind`, { title, body }),
  questionSentiment: (activityId: string, questionId: string) =>
    api.post<ApiResponse<OpenAnswerSentimentDTO[]>>(`/surveys/admin/${activityId}/questions/${questionId}/sentiment`, {}),
};
