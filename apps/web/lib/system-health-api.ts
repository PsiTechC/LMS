import { api, ApiResponse } from "./api";

export type ServiceStatus = "healthy" | "unhealthy" | "degraded" | "not_configured";

export interface ServiceStatusDTO {
  name: string;
  status: ServiceStatus;
  detail?: string;
  latency_ms?: number;
}

export interface DBPoolDTO {
  open_connections: number;
  in_use: number;
  idle: number;
  max_open: number;
  wait_count: number;
  wait_duration_ms: number;
}

export interface HealthOverviewDTO {
  status: "healthy" | "degraded" | "unhealthy";
  uptime_seconds: number;
  services: ServiceStatusDTO[];
  db_pool: DBPoolDTO;
  window_mins: number;
  total_requests: number;
  error_count: number;
  error_rate: number;   // 0..1
  avg_latency_ms: number;
  max_latency_ms: number;
}

export interface TrendPointDTO {
  bucket: string;       // RFC3339, start of the 5-min window
  avg_latency_ms: number;
  request_count: number;
  error_count: number;
  error_rate: number;
}

export interface EndpointMetricDTO {
  route: string;
  method: string;
  request_count: number;
  error_count: number;
  error_rate: number;
  avg_latency_ms: number;
  max_latency_ms: number;
}

export const systemHealthApi = {
  overview: () => api.get<ApiResponse<HealthOverviewDTO>>(`/system-health`),
  trend: (windowMins?: number) =>
    api.get<ApiResponse<TrendPointDTO[]>>(`/system-health/trend${windowMins ? "?window_mins=" + windowMins : ""}`),
  endpoints: (windowMins?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (windowMins) params.set("window_mins", String(windowMins));
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return api.get<ApiResponse<EndpointMetricDTO[]>>(`/system-health/endpoints${qs ? "?" + qs : ""}`);
  },
  // AI Platform Optimization Advisor — narrative synthesized from real
  // request volume/error-rate/latency trend and DB pool data (24h vs prior
  // 24h). On-demand (LLM call), not fetched on every dashboard load.
  optimizationBrief: () =>
    api.post<ApiResponse<{ brief: string }>>(`/system-health/optimization-brief`, {}),
};
