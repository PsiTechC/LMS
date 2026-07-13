import { api, ApiResponse } from "./api";

export interface ZoomOAuthStatusDTO {
  connected: boolean;
  status: "active" | "expired" | "disconnected" | "not_connected";
  zoom_email?: string;
}

export const zoomOAuthApi = {
  status: () => api.get<ApiResponse<ZoomOAuthStatusDTO>>("/zoom/oauth/status"),
  disconnect: () => api.post<ApiResponse<{ disconnected: boolean }>>("/zoom/oauth/disconnect", {}),
  // Fetches the Zoom consent URL (authenticated) — the caller is responsible
  // for the actual top-level navigation via window.location.href.
  getAuthorizeUrl: (returnTo?: string) => {
    const q = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "";
    return api.get<ApiResponse<{ url: string }>>(`/zoom/oauth/authorize${q}`);
  },
};
