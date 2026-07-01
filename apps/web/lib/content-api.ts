const _rawBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";
const BASE = _rawBase.endsWith("/api/v1") ? _rawBase.slice(0, -7) : _rawBase;

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("xa_token") ?? "";
  return { Authorization: `Bearer ${token}` };
}

export interface AssetDTO {
  id: string;
  org_id: string;
  created_by: string;
  creator_name: string;
  title: string;
  description?: string;
  asset_type: string;
  status: "draft" | "active" | "archived";
  has_file: boolean;
  file_name?: string;
  file_size_bytes?: number;
  mime_type?: string;
  file_url?: string;
  tags: string[];
  used_in_count: number;
  program_ids: string[];
  program_titles: string[];
  question_count?: number;
  duration_mins?: number;
  scorm_entry?: string;
  video_url?: string;
  created_at: string;
  updated_at: string;
}

export interface LibraryStatsDTO {
  total_assets: number;
  active_assets: number;
  draft_assets: number;
  type_count: number;
}

export interface ListAssetsResponse {
  assets: AssetDTO[];
  stats: LibraryStatsDTO;
}

export interface CreateAssetPayload {
  title: string;
  description?: string;
  asset_type: string;
  tags?: string[];
  question_count?: number;
  duration_mins?: number;
  scorm_entry?: string;
  video_url?: string;
  file?: File;
}

export interface UpdateAssetPayload {
  title?: string;
  description?: string;
  status?: string;
  tags?: string[];
  question_count?: number;
  duration_mins?: number;
  scorm_entry?: string;
  video_url?: string;
  file?: File;
}

async function handleResponse<T>(res: Response): Promise<{ data: T }> {
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  }
  return { data: json.data as T };
}

export const contentApi = {
  async list(orgId: string, opts?: { type?: string; status?: string; search?: string }): Promise<{ data: ListAssetsResponse }> {
    const params = new URLSearchParams({ org_id: orgId });
    if (opts?.type && opts.type !== "all") params.set("type", opts.type);
    if (opts?.status) params.set("status", opts.status);
    if (opts?.search) params.set("search", opts.search);
    const res = await fetch(`${BASE}/api/v1/content/assets?${params}`, {
      headers: authHeaders(),
    });
    return handleResponse<ListAssetsResponse>(res);
  },

  async get(orgId: string, id: string): Promise<{ data: AssetDTO }> {
    const res = await fetch(`${BASE}/api/v1/content/assets/${id}?org_id=${orgId}`, {
      headers: authHeaders(),
    });
    return handleResponse<AssetDTO>(res);
  },

  async create(orgId: string, payload: CreateAssetPayload): Promise<{ data: AssetDTO }> {
    const form = new FormData();
    form.append("org_id", orgId);
    form.append("title", payload.title);
    if (payload.description) form.append("description", payload.description);
    form.append("asset_type", payload.asset_type);
    if (payload.tags?.length) form.append("tags", JSON.stringify(payload.tags));
    if (payload.question_count != null) form.append("question_count", String(payload.question_count));
    if (payload.duration_mins != null) form.append("duration_mins", String(payload.duration_mins));
    if (payload.scorm_entry) form.append("scorm_entry", payload.scorm_entry);
    if (payload.video_url) form.append("video_url", payload.video_url);
    if (payload.file) form.append("file", payload.file);

    const res = await fetch(`${BASE}/api/v1/content/assets`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    return handleResponse<AssetDTO>(res);
  },

  async update(orgId: string, id: string, payload: UpdateAssetPayload): Promise<{ data: AssetDTO }> {
    if (payload.file) {
      const form = new FormData();
      form.append("org_id", orgId);
      if (payload.title) form.append("title", payload.title);
      if (payload.description) form.append("description", payload.description);
      if (payload.status) form.append("status", payload.status);
      if (payload.tags?.length) form.append("tags", JSON.stringify(payload.tags));
      if (payload.question_count != null) form.append("question_count", String(payload.question_count));
      if (payload.duration_mins != null) form.append("duration_mins", String(payload.duration_mins));
      if (payload.scorm_entry) form.append("scorm_entry", payload.scorm_entry);
      if (payload.video_url) form.append("video_url", payload.video_url);
      form.append("file", payload.file);
      const res = await fetch(`${BASE}/api/v1/content/assets/${id}?org_id=${orgId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: form,
      });
      return handleResponse<AssetDTO>(res);
    }

    const body: Record<string, unknown> = {};
    if (payload.title !== undefined) body.title = payload.title;
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.status !== undefined) body.status = payload.status;
    if (payload.tags !== undefined) body.tags = payload.tags;
    if (payload.question_count !== undefined) body.question_count = payload.question_count;
    if (payload.duration_mins !== undefined) body.duration_mins = payload.duration_mins;
    if (payload.scorm_entry !== undefined) body.scorm_entry = payload.scorm_entry;
    if (payload.video_url !== undefined) body.video_url = payload.video_url;
    const res = await fetch(`${BASE}/api/v1/content/assets/${id}?org_id=${orgId}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return handleResponse<AssetDTO>(res);
  },

  async archive(orgId: string, id: string): Promise<void> {
    const res = await fetch(`${BASE}/api/v1/content/assets/${id}/archive?org_id=${orgId}`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.error?.message ?? "Failed to archive asset");
    }
  },

  fileUrl(id: string, orgId: string): string {
    const token = typeof window !== "undefined" ? (localStorage.getItem("xa_token") ?? "") : "";
    return `${BASE}/api/v1/content/assets/${id}/file?org_id=${orgId}&token=${encodeURIComponent(token)}`;
  },
};
