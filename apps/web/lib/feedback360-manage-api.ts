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

// A behavior statement IS the item a rater rates - there is no separate question.
export interface BehaviorDTO {
  id: string;
  competency_id: string;
  statement: string;
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
  createBehavior: (competencyId: string, body: { statement: string; mandatory?: boolean; sort_order?: number }) =>
    api.post<ApiResponse<BehaviorDTO>>(`/competencies/${competencyId}/behaviors`, body),
  updateBehavior: (behaviorId: string, body: { statement?: string; mandatory?: boolean; sort_order?: number }) =>
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
  /** Names the "Others" category for participants (e.g. "Customers").
   *  Required once `others` >= 1. */
  others_label: string;
}

export interface CycleBehavior {
  statement: string;
  mandatory: boolean;
  sort_order: number;
}

export interface CycleCompetency {
  competency_id: string;
  title: string;
  behaviors: CycleBehavior[];
}

// OpenQuestion is one of the cycle's three free-text questions, asked once at the
// end of the rater form (after all competencies).
export interface OpenQuestion {
  prompt: string;
  mandatory: boolean;
  sort_order: number;
}

export interface CycleDetail {
  id: string;
  org_id: string;
  status: string;
  initiated_by_role: string;
  locked_at?: string | null;
  created_at: string;
  // True once the configuration has completed Review & Lock at least once
  // (including one since reopened) - lets the wizard jump freely between steps.
  was_locked: boolean;
  assigned_count: number;
  invited_count: number;
  completed_count: number;
  quorum: QuorumConfig;
  competencies: CycleCompetency[];
  open_questions: OpenQuestion[];
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
    behaviors: { statement: string; mandatory: boolean; sort_order: number }[];
  }[];
  open_questions: OpenQuestion[];
}

// An organization has exactly ONE 360° configuration. Every call is keyed by org
// (superadmin passes ?org_id=; a Program Manager is auto-scoped server-side).
// There is no cycle to create, name, list, or delete.
// One organization's 360° status in the superadmin "All Orgs" roll-up.
export interface OrgOverview {
  org_id: string;
  org_name: string;
  status: string; // not_configured | draft | configuring | locked | active | completed
  locked_at?: string | null;
  competency_count: number;
  statement_count: number;
  assigned_count: number;
  invited_count: number;
  completed_count: number;
}

export const feedback360ManageApi = {
  // Cross-org roll-up (superadmin). Read-only - never creates a config.
  orgsOverview: () =>
    api.get<ApiResponse<OrgOverview[]>>(`/feedback_360/admin/orgs_overview`),

  // Returns the org's config, creating an empty draft on first open.
  getConfig: (orgId?: string) =>
    api.get<ApiResponse<CycleDetail>>(`/feedback_360/admin/config${orgQ(orgId)}`),

  saveQuorum: (orgId: string | undefined, quorum: QuorumConfig) =>
    api.patch<ApiResponse<CycleDetail>>(`/feedback_360/admin/config/quorum${orgQ(orgId)}`, quorum),

  saveOpenQuestions: (orgId: string | undefined, openQuestions: OpenQuestion[]) =>
    api.patch<ApiResponse<CycleDetail>>(
      `/feedback_360/admin/config/open_questions${orgQ(orgId)}`,
      { open_questions: openQuestions },
    ),

  lockConfig: (orgId: string | undefined, payload: LockPayload) =>
    api.post<ApiResponse<CycleDetail>>(`/feedback_360/admin/config/lock${orgQ(orgId)}`, payload),

  // Reopen the locked configuration for editing.
  reopenConfig: (orgId?: string) =>
    api.post<ApiResponse<CycleDetail>>(`/feedback_360/admin/config/reopen${orgQ(orgId)}`, {}),

  quorumDefault: (orgId?: string) =>
    api.get<ApiResponse<QuorumConfig>>(`/feedback_360/admin/quorum_default${orgQ(orgId)}`),

  programs: (orgId?: string) =>
    api.get<ApiResponse<ProgramOption[]>>(`/feedback_360/admin/programs${orgQ(orgId)}`),
  cohorts: (programId: string, orgId?: string) =>
    api.get<ApiResponse<CohortOption[]>>(`/feedback_360/admin/programs/${programId}/cohorts${orgQ(orgId)}`),

  assignable: (
    orgId: string | undefined,
    filters: { program_id?: string; cohort_id?: string; enrollment_status?: string; search?: string },
  ) =>
    api.get<ApiResponse<AssignableParticipant[]>>(
      `/feedback_360/admin/assignable${orgQ(orgId, filters)}`,
    ),
  participants: (orgId?: string) =>
    api.get<ApiResponse<CycleParticipant[]>>(`/feedback_360/admin/participants${orgQ(orgId)}`),
  assign: (
    orgId: string | undefined,
    body: {
      user_ids?: string[];
      select_all?: boolean;
      program_id?: string;
      cohort_id?: string;
      enrollment_status?: string;
      search?: string;
    },
  ) => api.post<ApiResponse<{ assigned: number }>>(`/feedback_360/admin/assign${orgQ(orgId)}`, body),
  invite: (orgId: string | undefined, participantIds?: string[]) =>
    api.post<ApiResponse<{ invited: number }>>(`/feedback_360/admin/invite${orgQ(orgId)}`, {
      participant_ids: participantIds ?? [],
    }),
  remind: (orgId: string | undefined, body: { participant_ids?: string[]; all?: boolean }) =>
    api.post<ApiResponse<{ reminded: number }>>(`/feedback_360/admin/remind${orgQ(orgId)}`, body),
};
