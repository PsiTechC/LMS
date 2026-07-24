import { api, ApiResponse, BASE_URL } from "./api";

export interface CertificateDTO {
  id: string;
  program_id: string;
  program_title: string;
  serial_code: string;
  issued_at: string;
  revoked: boolean;
  manually_issued: boolean;
}

export interface VerifyResultDTO {
  valid: boolean;
  participant_name?: string;
  program_title?: string;
  issued_at?: string;
  revoked?: boolean;
}

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("xa_token") : null;
}

export const certificatesApi = {
  listMine: () => api.get<ApiResponse<CertificateDTO[]>>("/certificates"),

  // Downloads the certificate PDF as a blob URL - same pattern as
  // faculty-api.ts's fetchFileBlob (auth header required, so a plain <a href>
  // to the API URL won't work).
  downloadFile: async (id: string): Promise<{ blobUrl: string; mimeType: string }> => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/certificates/${id}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Failed to download certificate");
    const mimeType = (res.headers.get("Content-Type") ?? "application/pdf").split(";")[0].trim();
    const blob = await res.blob();
    return { blobUrl: URL.createObjectURL(blob), mimeType };
  },

  manualIssue: (enrollmentId: string) =>
    api.post<ApiResponse<CertificateDTO>>(`/certificates/${enrollmentId}/issue`, {}),

  revoke: (id: string) =>
    api.post<ApiResponse<{ revoked: boolean }>>(`/certificates/${id}/revoke`, {}),

  // Public - unauthenticated, no token needed.
  verify: async (code: string): Promise<VerifyResultDTO> => {
    const res = await fetch(`${BASE_URL}/certificates/${encodeURIComponent(code)}/verify`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? "Verification failed");
    return json.data as VerifyResultDTO;
  },
};
