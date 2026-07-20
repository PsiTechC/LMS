import { api, ApiResponse, BASE_URL } from "./api";

export interface AuditEventDTO {
  id: string;
  actor_user_id?: string;
  actor_name?: string;
  actor_email?: string;
  actor_role?: string;
  org_id?: string;
  category: string;
  action: string;
  target_type?: string;
  target_id?: string;
  severity: "info" | "warning" | "error" | "success";
  detail?: unknown;
  created_at: string;
}

export interface AuditSummaryDTO {
  total_today: number;
  errors: number;
  warnings: number;
  admin_actions: number;
}

export interface AuditQuery {
  category?: string;
  severity?: string;
  org_id?: string;
  user_search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

function toQueryString(params: AuditQuery): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null);
  const qs = new URLSearchParams(entries as [string, string][]).toString();
  return qs ? `?${qs}` : "";
}

export const auditApi = {
  list: (params: AuditQuery = {}) =>
    api.get<ApiResponse<AuditEventDTO[]>>(`/audit-events${toQueryString(params)}`),

  // orgId scopes the 4 dashboard counts to one org; omit/"" = platform-wide.
  summary: (orgId?: string) =>
    api.get<ApiResponse<AuditSummaryDTO>>(`/audit-events/summary${orgId ? `?org_id=${orgId}` : ""}`),

  // Every distinct category value actually present in audit_events - the
  // real, complete list (not a windowed sample of the paginated list).
  categories: () => api.get<ApiResponse<string[]>>(`/audit-events/categories`),

  // CSV export - returns a Blob (endpoint responds with text/csv, not JSON).
  exportCsv: async (params: AuditQuery = {}): Promise<Blob> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("xa_token") : null;
    const res = await fetch(`${BASE_URL}/audit-events/export${toQueryString(params)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error("Export failed");
    return res.blob();
  },
};
