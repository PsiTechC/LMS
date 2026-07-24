import { apiClient } from './client';
import type { MyEnrollmentDTO } from '../types/api';

/**
 * Cohorts/enrollment endpoints — exact contract from
 * api/internal/cohorts/{handler,dto}.go, matching apps/web/lib/cohorts-api.ts.
 * Only the participant-facing subset the mobile app actually calls.
 */
export const cohortsApi = {
  myEnrollments: () => apiClient.get<MyEnrollmentDTO[]>('/cohorts/my'),

  // AI Daily Focus — real LLM-generated nudge shown on the web My Journey tab
  // (JourneyDashboard in apps/web/app/dashboard/participant/page.tsx). Same
  // POST /cohorts/ai_daily_focus endpoint.
  aiDailyFocus: () => apiClient.post<{ insight: string }>('/cohorts/ai_daily_focus'),
};
