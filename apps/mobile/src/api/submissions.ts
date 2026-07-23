import { apiClient } from './client';
import type { SubmissionDTO } from '../types/api';

/**
 * Submissions endpoints — exact contract from api/internal/submissions,
 * matching apps/web/lib/submissions-api.ts. `my` 404s when no submission
 * exists yet for the activity — callers must treat that as "not submitted",
 * not an error.
 */
export const submissionsApi = {
  my: (activityId: string) =>
    apiClient.get<SubmissionDTO>(`/submissions/my?activity_id=${activityId}`),

  submit: (body: { activity_id: string; content?: string; file_url?: string }) =>
    apiClient.post<SubmissionDTO>('/submissions', body),
};
