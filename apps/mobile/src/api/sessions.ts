import { apiClient } from './client';
import type { SessionDTO } from '../types/api';

/**
 * Sessions endpoints — exact contract from api/internal/sessions, matching
 * apps/web/lib/sessions-api.ts.
 */
export const sessionsApi = {
  list: (params: { cohort_id?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.cohort_id) qs.set('cohort_id', params.cohort_id);
    if (params.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return apiClient.get<SessionDTO[]>(`/sessions${query ? `?${query}` : ''}`);
  },
};
