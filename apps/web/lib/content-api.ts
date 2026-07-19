const _rawBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";
const BASE = _rawBase.endsWith("/api/v1") ? _rawBase.slice(0, -7) : _rawBase;

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("xa_token") ?? "";
  return { Authorization: `Bearer ${token}` };
}

export type QuestionType = "mcq" | "true_false" | "matching" | "open" | "scale";

export interface MatchPair {
  left: string;
  right: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  correct_index?: number;
  correct_text?: string;
  match_pairs?: MatchPair[];
  scale_min?: number;
  scale_max?: number;
  scale_labels?: string[];
  points?: number;
  sort_order: number;
}

export interface QuestionSet {
  questions: Question[];
}

export interface CertificateConfig {
  cert_type: string;
  authority: string;
  sig_name: string;
  sig_title: string;
  trigger: string;
  validity: string;
  passing_score?: number;
  layout: string;
}

export interface CaseStudyBody {
  body_text: string;
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
  question_set?: QuestionSet;
  certificate?: CertificateConfig;
  case_study?: CaseStudyBody;
  // Quiz/assessment-only DEFAULTS — pre-fill for a placement's own Timer/
  // Attempts/Pass Score (Program Design Studio), never enforced here; a
  // placement can still override them per program.
  default_time_limit_mins?: number;
  default_attempts_allowed?: number;
  default_passing_score_pct?: number;
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

export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
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
  question_set?: QuestionSet;
  certificate?: CertificateConfig;
  case_study?: CaseStudyBody;
  default_time_limit_mins?: number;
  default_attempts_allowed?: number;
  default_passing_score_pct?: number;
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
  default_time_limit_mins?: number;
  default_attempts_allowed?: number;
  default_passing_score_pct?: number;
  question_set?: QuestionSet;
  certificate?: CertificateConfig;
  case_study?: CaseStudyBody;
  file?: File;
}

export interface AIChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AIQuizGenerateRequest {
  prompt: string;
  asset_type: string;
  existing_draft?: QuestionSet;
  existing_title?: string;
  chat_history?: AIChatTurn[];
}

export interface AIQuizGenerateResponse {
  title: string;
  description: string;
  question_set: QuestionSet;
  assistant_message: string;
}

async function handleResponse<T>(res: Response): Promise<{ data: T }> {
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  }
  return { data: json.data as T };
}

async function handleListResponse<T>(res: Response): Promise<{ data: T; meta: PageMeta }> {
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  }
  return { data: json.data as T, meta: json.meta as PageMeta };
}

export const contentApi = {
  async list(
    orgId: string,
    opts?: { type?: string; status?: string; search?: string; page?: number; perPage?: number }
  ): Promise<{ data: ListAssetsResponse; meta: PageMeta }> {
    const params = new URLSearchParams({ org_id: orgId });
    if (opts?.type && opts.type !== "all") params.set("type", opts.type);
    if (opts?.status) params.set("status", opts.status);
    if (opts?.search) params.set("search", opts.search);
    params.set("page", String(opts?.page ?? 1));
    params.set("per_page", String(opts?.perPage ?? 20));
    const res = await fetch(`${BASE}/api/v1/content/assets?${params}`, {
      headers: authHeaders(),
    });
    return handleListResponse<ListAssetsResponse>(res);
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
    if (payload.question_set) form.append("question_set", JSON.stringify(payload.question_set));
    if (payload.certificate) form.append("certificate", JSON.stringify(payload.certificate));
    if (payload.case_study) form.append("case_study", JSON.stringify(payload.case_study));
    if (payload.default_time_limit_mins != null) form.append("default_time_limit_mins", String(payload.default_time_limit_mins));
    if (payload.default_attempts_allowed != null) form.append("default_attempts_allowed", String(payload.default_attempts_allowed));
    if (payload.default_passing_score_pct != null) form.append("default_passing_score_pct", String(payload.default_passing_score_pct));
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
      if (payload.question_set) form.append("question_set", JSON.stringify(payload.question_set));
      if (payload.certificate) form.append("certificate", JSON.stringify(payload.certificate));
      if (payload.case_study) form.append("case_study", JSON.stringify(payload.case_study));
      if (payload.default_time_limit_mins != null) form.append("default_time_limit_mins", String(payload.default_time_limit_mins));
      if (payload.default_attempts_allowed != null) form.append("default_attempts_allowed", String(payload.default_attempts_allowed));
      if (payload.default_passing_score_pct != null) form.append("default_passing_score_pct", String(payload.default_passing_score_pct));
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
    if (payload.question_set !== undefined) body.question_set = payload.question_set;
    if (payload.certificate !== undefined) body.certificate = payload.certificate;
    if (payload.case_study !== undefined) body.case_study = payload.case_study;
    if (payload.default_time_limit_mins !== undefined) body.default_time_limit_mins = payload.default_time_limit_mins;
    if (payload.default_attempts_allowed !== undefined) body.default_attempts_allowed = payload.default_attempts_allowed;
    if (payload.default_passing_score_pct !== undefined) body.default_passing_score_pct = payload.default_passing_score_pct;
    const res = await fetch(`${BASE}/api/v1/content/assets/${id}?org_id=${orgId}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return handleResponse<AssetDTO>(res);
  },

  async aiGenerateQuiz(orgId: string, req: AIQuizGenerateRequest, file?: File): Promise<{ data: AIQuizGenerateResponse }> {
    const form = new FormData();
    form.append("org_id", orgId);
    form.append("prompt", req.prompt);
    form.append("asset_type", req.asset_type);
    if (req.existing_title) form.append("existing_title", req.existing_title);
    if (req.existing_draft) form.append("existing_draft", JSON.stringify(req.existing_draft));
    if (req.chat_history?.length) form.append("chat_history", JSON.stringify(req.chat_history));
    if (file) form.append("file", file);

    const res = await fetch(`${BASE}/api/v1/content/ai/quiz-generate`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    return handleResponse<AIQuizGenerateResponse>(res);
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

  async delete(orgId: string, id: string): Promise<void> {
    const res = await fetch(`${BASE}/api/v1/content/assets/${id}?org_id=${orgId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.error?.message ?? "Failed to delete asset");
    }
  },
  fileUrl(id: string, orgId: string): string {
    const token = typeof window !== "undefined" ? (localStorage.getItem("xa_token") ?? "") : "";
    return `${BASE}/api/v1/content/assets/${id}/file?org_id=${orgId}&token=${encodeURIComponent(token)}`;
  },
};
