import { api, ApiResponse } from "./api";

// AI Study Companion - single-shot generation grounded in one module's own
// content (not the chat SSE shape used by ai-coach-api.ts).

export type StudyCompanionMode = "practice_questions" | "scenario_simulation" | "concept_explanation" | "summary";

export interface StudyCompanionQuestionDTO {
  question: string;
  model_answer: string;
  difficulty: "easy" | "medium" | "hard" | string;
}

export interface StudyCompanionScenarioDTO {
  scenario: string;
  guidance: string;
  difficulty: "easy" | "medium" | "hard" | string;
}

export interface StudyCompanionConceptDTO {
  term: string;
  explanation: string;
}

export interface StudyCompanionSummarySectionDTO {
  heading: string;
  body: string;
}

// Exactly one of these is populated, matching `mode`.
export interface StudyCompanionResponseDTO {
  activity_id: string;
  mode: StudyCompanionMode;
  questions?: StudyCompanionQuestionDTO[];
  scenarios?: StudyCompanionScenarioDTO[];
  concepts?: StudyCompanionConceptDTO[];
  summary?: StudyCompanionSummarySectionDTO[];
}

export interface StudyCompanionAvailabilityDTO {
  activity_id: string;
  available: boolean;
  reason?: string;
}

export const studyCompanionApi = {
  availability: (activityId: string) =>
    api.get<ApiResponse<StudyCompanionAvailabilityDTO>>(`/ai/study-companion/availability/${activityId}`),
  generate: (activityId: string, mode: StudyCompanionMode, count?: number) =>
    api.post<ApiResponse<StudyCompanionResponseDTO>>("/ai/study-companion/generate", {
      activity_id: activityId,
      mode,
      count: count ?? 5,
    }),
};
