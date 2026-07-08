import { api, ApiResponse } from "./api";

// Admin-initiated 360° flow (Superadmin / Program Manager). All calls are org-
// scoped: Superadmin passes ?org_id=; Program Manager is auto-scoped server-side
// from their JWT (org_id may be omitted). We always append org_id when we have it.

function orgQ(orgId?: string, extra?: Record<string, string>): string {
  const p = new URLSearchParams();
  if (orgId) p.set("org_id", orgId);
  if (extra) for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ── Competency framework (competencies module) ────────────────────

export interface CompetencyDTO {
  id: string;
  org_id: string;
  title: string;
  description?: string;
  category: string;
}

export interface BehaviorDTO {
  id: string;
  competency_id: string;
  statement: string;
  question_text?: string | null;
  use_statement: boolean;
  mandatory: boolean;
  sort_order: number;
}

export const frameworkApi = {
  listCompetencies: (orgId: string) =>
    api.get<ApiResponse<CompetencyDTO[]>>(`/competencies?org_id=${orgId}`),
  createCompetency: (orgId: string, body: { title: string; description?: string; category: string }) =>
    api.post<ApiResponse<CompetencyDTO>>(`/competencies?org_id=${orgId}`, body),
  updateCompetency: (id: string, body: { title?: string; description?: string; category?: string }) =>
    api.patch<ApiResponse<CompetencyDTO>>(`/competencies/${id}`, body),
  deleteCompetency: (id: string) =>
    api.delete<ApiResponse<null>>(`/competencies/${id}`),

  listBehaviors: (competencyId: string) =>
    api.get<ApiResponse<BehaviorDTO[]>>(`/competencies/${competencyId}/behaviors`),
  createBehavior: (competencyId: string, body: { statement: string; question_text?: string; use_statement?: boolean; mandatory?: boolean; sort_order?: number }) =>
    api.post<ApiResponse<BehaviorDTO>>(`/competencies/${competencyId}/behaviors`, body),
  updateBehavior: (behaviorId: string, body: { statement?: string; question_text?: string; use_statement?: boolean; mandatory?: boolean; sort_order?: number }) =>
    api.patch<ApiResponse<BehaviorDTO>>(`/competencies/behaviors/${behaviorId}`, body),
  deleteBehavior: (behaviorId: string) =>
    api.delete<ApiResponse<null>>(`/competencies/behaviors/${behaviorId}`),
};

// ── Admin cycles ──────────────────────────────────────────────────

export interface QuorumConfig {
  skip_manager: number;
  manager: number;
  peer: number;
  direct_report: number;
  others: number;
}

export interface CycleBehavior {
  statement: string;
  question_text: string;
  mandatory: boolean;
  sort_order: number;
}

export interface CycleCompetency {
  competency_id: string;
  title: string;
  behaviors: CycleBehavior[];
}

export interface CycleDetail {
  id: string;
  name: string;
  org_id: string;
  status: string;
  initiated_by_role: string;
  locked_at?: string | null;
  created_at: string;
  quorum: QuorumConfig;
  competencies: CycleCompetency[];
}

export interface CycleSummary {
  id: string;
  name: string;
  status: string;
  initiated_by_role: string;
  locked_at?: string | null;
  created_at: string;
  assigned_count: number;
  invited_count: number;
  completed_count: number;
}

export interface ProgramOption {
  id: string;
  name: string;
  has_cohorts: boolean;
}

export interface CohortOption {
  id: string;
  name: string;
}

export interface AssignableParticipant {
  user_id: string;
  name: string;
  email: string;
  department?: string;
  program_id?: string;
  program_name?: string;
  cohort_id?: string;
  cohort_name?: string;
  status: string;
  already_in_cycle: boolean;
}

export interface CycleParticipant {
  id: string;
  user_id: string;
  name: string;
  email: string;
  program_name?: string;
  cohort_name?: string;
  status: string;
  invited_at?: string | null;
  reminded_at?: string | null;
  completed_at?: string | null;
}

export interface LockPayload {
  quorum: QuorumConfig;
  competencies: {
    competency_id: string;
    title: string;
    behaviors: { statement: string; question_text: string; mandatory: boolean; sort_order: number }[];
  }[];
}

export const feedback360ManageApi = {
  listCycles: (orgId?: string) =>
    api.get<ApiResponse<CycleSummary[]>>(`/feedback_360/admin/cycles${orgQ(orgId)}`),
  createCycle: (orgId: string | undefined, name: string) =>
    api.post<ApiResponse<CycleDetail>>(`/feedback_360/admin/cycles${orgQ(orgId)}`, { name }),
  getCycle: (id: string, orgId?: string) =>
    api.get<ApiResponse<CycleDetail>>(`/feedback_360/admin/cycles/${id}${orgQ(orgId)}`),
  updateCycle: (id: string, orgId: string | undefined, name: string) =>
    api.patch<ApiResponse<CycleDetail>>(`/feedback_360/admin/cycles/${id}${orgQ(orgId)}`, { name }),
  saveQuorum: (id: string, orgId: string | undefined, quorum: QuorumConfig) =>
    api.patch<ApiResponse<CycleDetail>>(`/feedback_360/admin/cycles/${id}/quorum${orgQ(orgId)}`, quorum),

  lockCycle: (id: string, orgId: string | undefined, payload: LockPayload) =>
    api.post<ApiResponse<CycleDetail>>(`/feedback_360/admin/cycles/${id}/lock${orgQ(orgId)}`, payload),

  quorumDefault: (orgId?: string) =>
    api.get<ApiResponse<QuorumConfig>>(`/feedback_360/admin/quorum_default${orgQ(orgId)}`),

  programs: (orgId?: string) =>
    api.get<ApiResponse<ProgramOption[]>>(`/feedback_360/admin/programs${orgQ(orgId)}`),
  cohorts: (programId: string, orgId?: string) =>
    api.get<ApiResponse<CohortOption[]>>(`/feedback_360/admin/programs/${programId}/cohorts${orgQ(orgId)}`),

  assignable: (
    id: string,
    orgId: string | undefined,
    filters: { program_id?: string; cohort_id?: string; enrollment_status?: string; search?: string },
  ) =>
    api.get<ApiResponse<AssignableParticipant[]>>(
      `/feedback_360/admin/cycles/${id}/assignable${orgQ(orgId, filters)}`,
    ),
  participants: (id: string, orgId?: string) =>
    api.get<ApiResponse<CycleParticipant[]>>(`/feedback_360/admin/cycles/${id}/participants${orgQ(orgId)}`),
  assign: (
    id: string,
    orgId: string | undefined,
    body: {
      user_ids?: string[];
      select_all?: boolean;
      program_id?: string;
      cohort_id?: string;
      enrollment_status?: string;
      search?: string;
    },
  ) => api.post<ApiResponse<{ assigned: number }>>(`/feedback_360/admin/cycles/${id}/assign${orgQ(orgId)}`, body),
  invite: (id: string, orgId: string | undefined, participantIds?: string[]) =>
    api.post<ApiResponse<{ invited: number }>>(`/feedback_360/admin/cycles/${id}/invite${orgQ(orgId)}`, {
      participant_ids: participantIds ?? [],
    }),
  remind: (id: string, orgId: string | undefined, body: { participant_ids?: string[]; all?: boolean }) =>
    api.post<ApiResponse<{ reminded: number }>>(`/feedback_360/admin/cycles/${id}/remind${orgQ(orgId)}`, body),
};
