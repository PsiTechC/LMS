import { BASE_URL } from "./api";

// Platform report export (PDF) — POST /reports/platform/export, an action
// endpoint per CLAUDE.md's URL conventions (POST + verb suffix, not GET,
// since it triggers server-side generation work each call). Bypasses the
// JSON envelope like audit's CSV export — the response is a raw PDF blob.
export const reportsApi = {
  exportPlatformReport: async (): Promise<Blob> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("xa_token") : null;
    const res = await fetch(`${BASE_URL}/reports/platform/export`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      let message = "Report generation failed";
      try {
        const json = await res.json();
        message = json?.error?.message || message;
      } catch {
        // response wasn't JSON (e.g. a raw 500) — keep the generic message
      }
      throw new Error(message);
    }
    return res.blob();
  },
};
