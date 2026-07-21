import { BASE_URL } from "./api";

// Public, unauthenticated external survey respondent API (facilitator/manager/
// business sponsor). The token in the URL is the only credential - mirrors
// rater-api.ts's no-Authorization-header pattern.

export type QuestionType = "likert" | "nps" | "mcq" | "rating" | "open";

export interface ExternalQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
}

export interface ExternalForm {
  title: string;
  role_label: string;
  already_submitted: boolean;
  questions: ExternalQuestion[];
}

export interface ExternalAnswerInput {
  question_id: string;
  num?: number;
  text?: string;
}

export class SurveyExternalError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new SurveyExternalError(json?.error?.message ?? "Request failed", res.status);
  }
  return json.data as T;
}

export const surveyExternalApi = {
  // Viewing never consumes the token - safe for mail scanners to pre-fetch.
  getForm: (token: string) => call<ExternalForm>(`/surveys/external/${token}`),

  submit: (token: string, answers: ExternalAnswerInput[]) =>
    call<{ status: string }>(`/surveys/external/${token}`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
};
