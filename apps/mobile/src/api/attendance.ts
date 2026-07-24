import { apiClient } from './client';
import type { CheckInResponse, MyCheckInStatusDTO, StartSessionResponse } from '../types/api';

/**
 * Attendance endpoints — exact contract from api/internal/attendance,
 * matching apps/web/lib/attendance-api.ts. Only the participant-side calls
 * (the web QR display is a faculty-facing convenience we deliberately do not
 * replicate — see SessionDetailScreen for the mobile-native flow: a manual
 * code entry that calls `checkIn` directly, since the participant is already
 * holding the device instead of scanning one).
 */
export const attendanceApi = {
  participantActive: (classSessionId: string) =>
    apiClient.get<StartSessionResponse>(
      `/attendance-sessions/participant-active?class_session_id=${classSessionId}`
    ),

  myStatus: (attendanceSessionId: string) =>
    apiClient.get<MyCheckInStatusDTO>(`/attendance-sessions/${attendanceSessionId}/my-status`),

  checkIn: (code: string) =>
    apiClient.post<CheckInResponse>('/attendance-sessions/check-in', { code }),
};
