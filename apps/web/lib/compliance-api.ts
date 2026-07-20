import { api, ApiResponse, BASE_URL } from "./api";

// ── Types ─────────────────────────────────────────────────────────

export interface CompletionGate {
  id: string;
  program_id: string;
  activity_id: string;
  prereq_activity_id: string;
  escalation_email: string;
  escalation_days: number;
  created_at: string;
}

export interface DataRetentionPolicy {
  id: string;
  program_id: string;
  submissions_days: number;
  recordings_days: number;
  chat_logs_days: number;
  updated_at: string;
}

export interface AttendanceRegisterRow {
  learner_name: string;
  learner_email: string;
  session_title: string;
  session_date: string;
  status: "present" | "absent" | "late";
  duration_mins: number;
}

export interface AttendanceRegisterResponse {
  cohort_id: string;
  rows: AttendanceRegisterRow[];
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_name?: string;
  action: string;
  resource: string;
  resource_id: string;
  ip_address?: string;
  created_at: string;
}

// ── API ───────────────────────────────────────────────────────────

export const complianceApi = {
  // Completion gates
  listGates: (programId: string) =>
    api.get<ApiResponse<CompletionGate[]>>(`/compliance/gates?program_id=${programId}`),
  upsertGate: (orgId: string, body: {
    program_id: string; activity_id: string; prereq_activity_id: string;
    escalation_email?: string; escalation_days?: number;
  }) => api.post<ApiResponse<CompletionGate>>(`/compliance/gates?org_id=${orgId}`, body),
  deleteGate: (id: string) =>
    api.delete<ApiResponse<null>>(`/compliance/gates/${id}`),

  // Data retention
  getRetention: (programId: string) =>
    api.get<ApiResponse<DataRetentionPolicy>>(`/compliance/retention?program_id=${programId}`),
  upsertRetention: (orgId: string, body: {
    program_id: string; submissions_days: number; recordings_days: number; chat_logs_days: number;
  }) => api.post<ApiResponse<DataRetentionPolicy>>(`/compliance/retention?org_id=${orgId}`, body),

  // GDPR ack
  ackGDPR: (context: string) =>
    api.post<ApiResponse<null>>("/compliance/gdpr/ack", { context }),

  // Attendance register
  getAttendanceRegister: (cohortId: string) =>
    api.get<ApiResponse<AttendanceRegisterResponse>>(`/compliance/attendance?cohort_id=${cohortId}`),

  // Audit logs
  listAuditLogs: (params: {
    org_id: string; user_id?: string; resource?: string; action?: string;
    date_from?: string; date_to?: string; page?: number; limit?: number;
  }) => {
    const qs = new URLSearchParams({ org_id: params.org_id });
    if (params.user_id)   qs.set("user_id",   params.user_id);
    if (params.resource)  qs.set("resource",  params.resource);
    if (params.action)    qs.set("action",    params.action);
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to)   qs.set("date_to",   params.date_to);
    if (params.page)      qs.set("page",      String(params.page));
    if (params.limit)     qs.set("limit",     String(params.limit));
    return api.get<ApiResponse<AuditLogEntry[]> & { meta?: { total: number } }>(`/compliance/audit-logs?${qs}`);
  },

  // CSV download helpers - direct to Go API so browser gets the file download
  attendanceCsvUrl: (cohortId: string) =>
    `${BASE_URL}/compliance/attendance?cohort_id=${cohortId}&format=csv`,
  auditCsvUrl: (orgId: string, filters?: { user_id?: string; resource?: string; date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams({ org_id: orgId, format: "csv" });
    if (filters?.user_id)   qs.set("user_id",   filters.user_id);
    if (filters?.resource)  qs.set("resource",  filters.resource);
    if (filters?.date_from) qs.set("date_from", filters.date_from);
    if (filters?.date_to)   qs.set("date_to",   filters.date_to);
    return `${BASE_URL}/compliance/audit-logs?${qs}`;
  },
};
