import { api, ApiResponse } from "./api";

// Mirrors api/internal/attendance/dto.go exactly.

export interface StartSessionResponse {
  attendance_session_id: string;
  code: string;
  join_url: string;
  qr_payload: string;
}

export interface CheckInResponse {
  status: string;
  checked_in_at: string;
  already_checked_in: boolean;
  class_session_title: string;
}

export interface RosterEntryDTO {
  participant_id: string;
  name: string;
  email: string;
  checked_in: boolean;
  checked_in_at?: string;
}

export interface ParticipantStatusDTO {
  id: string;
  name: string;
  status: "present" | "absent";
  scanned_at?: string;
}

export interface AttendanceSummaryDTO {
  present_count: number;
  absent_count: number;
  total_enrolled: number;
  participants: ParticipantStatusDTO[];
}

export interface MyCheckInStatusDTO {
  checked_in: boolean;
  checked_in_at?: string;
}

export const attendanceApi = {
  // Starts a new QR/code check-in window for a class session. mode
  // "virtual" also triggers Zoom meeting creation server-side (Phase 2).
  start: (classSessionId: string, mode: "virtual" | "in_person") =>
    api.post<ApiResponse<StartSessionResponse>>(`/attendance-sessions`, { class_session_id: classSessionId, mode }),

  // Returns the currently active window for a class session, if one exists
  // — used to avoid opening a duplicate window when the panel is reopened.
  // Throws (ApiError, status 404) if none is active.
  active: (classSessionId: string) =>
    api.get<ApiResponse<StartSessionResponse>>(`/attendance-sessions/active?class_session_id=${classSessionId}`),

  end: (attendanceSessionId: string) =>
    api.post<ApiResponse<{ ended: boolean }>>(`/attendance-sessions/${attendanceSessionId}/end`, {}),

  // Participant-side: fetch the active window's QR/code for a class session,
  // to display on their own device (enrollment-checked, not ownership-checked
  // like `active` above). Throws (404) if attendance hasn't been started yet.
  participantActive: (classSessionId: string) =>
    api.get<ApiResponse<StartSessionResponse>>(`/attendance-sessions/participant-active?class_session_id=${classSessionId}`),

  // Participant-side: poll their own check-in status while their device is
  // displaying the QR to be scanned externally (e.g. by their phone).
  myStatus: (attendanceSessionId: string) =>
    api.get<ApiResponse<MyCheckInStatusDTO>>(`/attendance-sessions/${attendanceSessionId}/my-status`),

  // Participant-side check-in, via a scanned QR (token present) or a
  // manually-typed code (token omitted).
  checkIn: (code: string, token?: string) =>
    api.post<ApiResponse<CheckInResponse>>(`/attendance-sessions/check-in`, token ? { code, token } : { code }),

  records: (attendanceSessionId: string) =>
    api.get<ApiResponse<RosterEntryDTO[]>>(`/attendance-sessions/${attendanceSessionId}/records`),

  summary: (attendanceSessionId: string) =>
    api.get<ApiResponse<AttendanceSummaryDTO>>(`/attendance-sessions/${attendanceSessionId}/summary`),
};
