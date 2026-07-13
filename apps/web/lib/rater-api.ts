import { BASE_URL } from "./api";

// Public, unauthenticated rater form API. Raters are EXTERNAL people with no
// account — the token in the URL is the only credential, so these calls
// deliberately send no Authorization header.

// The behavior statement IS the item the rater rates on the 1–5 scale.
export interface RaterBehavior {
  behavior_id: string;
  statement: string;
  mandatory: boolean;
  sort_order: number;
}

export interface RaterCompetency {
  competency_id: string;
  title: string;
  behaviors: RaterBehavior[];
}

export interface RaterOpenQuestion {
  question_id: string;
  prompt: string;
  mandatory: boolean;
  sort_order: number;
}

export interface RaterForm {
  cycle_name: string;
  org_name: string;
  participant_name: string;
  relationship: string;
  show_importance: boolean;
  already_submitted: boolean;
  competencies: RaterCompetency[];
  open_questions: RaterOpenQuestion[];
}

export interface BehaviorAnswer {
  behavior_id: string;
  score: number | null;
  importance: number | null;
  not_observed: boolean;
}

export interface OpenAnswer {
  question_id: string;
  answer_text: string;
}

export class RaterError extends Error {
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
    throw new RaterError(json?.error?.message ?? "Request failed", res.status);
  }
  return json.data as T;
}

export const raterApi = {
  // Viewing never consumes the token — safe for mail scanners to pre-fetch.
  getForm: (token: string) => call<RaterForm>(`/feedback_360/rater/${token}`),

  submit: (token: string, body: { behaviors: BehaviorAnswer[]; open_answers: OpenAnswer[] }) =>
    call<{ status: string }>(`/feedback_360/rater/${token}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
