import { apiClient } from './client';
import type {
  AnswerInput,
  AssessmentDetailDTO,
  AssessmentResultDTO,
  AssessmentStatusDTO,
  MyAssessmentsDTO,
} from '../types/api';

/**
 * Assessments (quiz-taking) endpoints — exact contract from
 * api/internal/assessments, matching apps/web/lib/assessments-api.ts.
 *
 * `my` already filters to quiz-backed assessment activities only — an
 * assessment-type activity with no linked Content Library quiz (essay/file
 * style) is intentionally omitted here and stays on the generic submissions
 * flow (see src/api/submissions.ts, used from ActivityDetailScreen).
 *
 * `detail` is what anchors a timed assessment's server-side countdown on
 * first call (getOrCreateAttemptSession) — do not call it speculatively
 * before the participant has chosen to start the attempt.
 */
export const assessmentsApi = {
  my: (programId?: string) =>
    apiClient.get<MyAssessmentsDTO>(`/assessments/my${programId ? `?program_id=${programId}` : ''}`),

  detail: (activityId: string) => apiClient.get<AssessmentDetailDTO>(`/assessments/${activityId}`),

  status: (activityId: string) => apiClient.get<AssessmentStatusDTO>(`/assessments/${activityId}/status`),

  submit: (activityId: string, answers: AnswerInput[]) =>
    apiClient.post<AssessmentResultDTO>('/assessments/submit', { activity_id: activityId, answers }),
};
