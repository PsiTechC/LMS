import { api, ApiResponse } from "./api";

export interface ScheduledSessionDTO {
  id: string;
  activity_id: string;
  program_id: string;
  cohort_id: string;
  faculty_id: string;
  faculty_name?: string;
  title: string;
  description?: string;
  session_type: string;
  virtual_link?: string;
  scheduled_at: string;
  duration_mins: number;
  status: string;
  created_at: string;
}

export interface ActivityFacultyDTO {
  id: string;
  activity_id: string;
  faculty_user_id: string;
  cohort_id?: string;
  cohort_name?: string;
  name: string;
  email: string;
  avatar_url?: string;
  role: string;
  override_note?: string;
}

export interface ConflictDTO {
  activity_id: string;
  activity_title: string;
  program_title: string;
  cohort_name: string;
  start_date: string;
  end_date: string;
  role: string;
}

export interface OrgFacultyMember {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

export interface OrgFacultyProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  specialization?: string;
  bio?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  certifications: string[];
  onboarding_status: "active" | "onboarding" | "inactive";
  sessions_count: number;
  scheduled_count: number;
  engagement_pct: number;
  avg_l1_score: number;
  program_ids: string[];
  program_titles: string[];
}

export interface FacultyDashboardDTO {
  total_faculty: number;
  sessions_delivered: number;
  avg_engagement: number;
  avg_l1_reaction: number;
  faculty_rows: FacultyPerformanceRow[];
}

export interface FacultyPerformanceRow {
  faculty_id: string;
  faculty_name: string;
  avatar_url?: string;
  specialization?: string;
  sessions: number;
  scheduled: number;
  engagement_pct: number;
  avg_l1_score: number;
  status: string;
}

export interface FacultyL1L4SummaryDTO {
  faculty_id: string;
  faculty_name: string;
  avatar_url?: string;
  specialization?: string;
  avg_l1: number;
  avg_l2: number;
  avg_l3: number;
  avg_l4: number;
  l1_responses: number;
  l2_responses: number;
  l3_responses: number;
  l4_responses: number;
}

export interface FacultyScheduleDay {
  date: string;
  is_busy: boolean;
  session_id?: string;
  session_title?: string;
  program_title?: string;
  role?: string;
}

export interface FacultyAssignmentDTO {
  activity_id: string;
  activity_title: string;
  activity_type: string;
  phase_name: string;
  program_id: string;
  program_title: string;
  program_color: string;
  cohort_id?: string;
  cohort_name?: string;
  role: string;
  start_day: number;
  duration_days: number;
}

// Per-type shape stored in ActivityDTO.config / activities.config_json.
// All fields optional â€” an activity can be scheduled before content is attached.
export interface ActivityConfig {
  asset_id?: string;             // video, pdf, case_study, assessment, survey â€” links to a content_assets row
  attempts_allowed?: number;     // assessment
  time_limit_mins?: number;      // assessment
  cooling_off_hours?: number;    // assessment
  scoring_method?: "highest" | "latest" | "average"; // assessment
  passing_score_pct?: number;    // assessment
  is_anonymous?: boolean;        // survey
  level?: "l1" | "l2" | "l3" | "l4" | ""; // survey - Kirkpatrick L1-L4 tag, empty for a plain survey
  external_link_enabled?: boolean; // survey - has an external respondent link
  session_type?: string;         // live_session | coaching
  prompt?: string;               // journal
  instructions?: string;         // assignment, peer_review
  allow_late_submit?: boolean;   // assignment
  reviewers_per_submission?: number; // peer_review
  // Optional quiz attached to a content-style activity (case_study/content/
  // video/pdf) - mirrors the Go KnowledgeCheck sub-config. Taken/graded through
  // the assessments engine keyed by this activity's id.
  knowledge_check?: {
    asset_id?: string;
    time_limit_mins?: number;
    attempts_allowed?: number;
    passing_score_pct?: number;
  };
}

export interface ActivityDTO {
  id: string;
  phase_id: string;
  module_id?: string;
  slot?: "" | "pre" | "post";
  title: string;
  description?: string;
  type: string;
  delivery_mode: string;
  sort_order: number;
  duration_mins: number;
  due_day_offset: number;
  start_day: number;
  duration_days: number;
  is_mandatory: boolean;
  config?: ActivityConfig;
  faculty?: ActivityFacultyDTO[];
  // Participant view only - see api/internal/programs/completion.go. A
  // post-slot activity is locked until its module's pre-work is complete.
  locked?: boolean;
  locked_reason?: string;
  // The real, cross-type completion signal (survey_completions/submissions/
  // assessment_attempts/activity_progress union) - use this instead of
  // deriving "done" from a single completion source like the generic
  // `submissions` map, which most activity types never write to.
  completed?: boolean;
}

export interface ModuleDTO {
  id: string;
  phase_id: string;
  title: string;
  delivery_mode: "virtual" | "in-person";
  session_date?: string;
  sort_order: number;
  pre: ActivityDTO[];
  post: ActivityDTO[];
}

// Drives which UI the Design Studio renders for a phase.
export type PhaseType =
  | "pre-enrolment" | "orientation" | "module-virtual" | "module-in-person"
  | "coaching" | "capstone" | "post-program" | "custom";

export interface PhaseDTO {
  id: string;
  program_id: string;
  title: string;
  description?: string;
  phase_number: number;
  week_label?: string;
  color: string;
  start_day: number;
  end_day: number;
  phase_type: PhaseType;
  delivery_mode?: "" | "virtual" | "in-person";
  modules: ModuleDTO[];
  activities: ActivityDTO[];
  // Participant view only. A phase (after the first) is locked until the
  // prior phase is fully complete AND this phase's own start date has
  // arrived - recomputed fresh on every fetch, so it advances automatically
  // as soon as both conditions are true, with no manual step.
  locked?: boolean;
  locked_reason?: string;
}

export interface RazorpayPaymentOrderDTO {
  payment_order_id: string;
  razorpay_order_id: string;
  razorpay_key_id: string;
  amount: number;
  currency: string;
  program_id: string;
  program_name: string;
}

export interface PaypalPaymentOrderDTO {
  payment_order_id: string;
  provider: "paypal";
  paypal_order_id: string;
  amount: number;
  currency: string;
  catalog_amount: number;
  catalog_currency: string;
  exchange_rate: string;
  program_id: string;
  program_name: string;
}

// Discriminated union: Razorpay's response never carries a "provider" key
// (left untouched since before PayPal existed), so the two shapes are told
// apart by checking for "paypal_order_id" rather than relying on `provider`
// being present on both.
export type PaymentOrderDTO = RazorpayPaymentOrderDTO | PaypalPaymentOrderDTO;

export function isPaypalOrder(order: PaymentOrderDTO): order is PaypalPaymentOrderDTO {
  return "paypal_order_id" in order;
}

export interface PaymentVerificationRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface PaymentFinalizationDTO {
  payment_order_id: string;
  program_id: string;
  enrollment_id: string;
  status: string;
}

export interface PaypalCaptureResultDTO {
  status: string;
}

export interface PaymentOrderStatusDTO {
  status: string;
  enrolled: boolean;
}
export interface ProgramDTO {
  id: string;
  org_id: string;
  title: string;
  description?: string;
  status: "draft" | "active" | "upcoming" | "delivered" | "archived";
  color: string;
  is_open?: boolean;
  payment_required: boolean;
  price_amount: number; // minor currency units (paise for INR) - divide by 100 to display
  currency: string;
  gst_inclusive: boolean;
  gst_rate_bps: number; // basis points; 1800 = 18%
  duration_weeks: number;
  start_date?: string;
  end_date?: string;
  published_at?: string;
  phase_count: number;
  activity_count: number;
  enrolled_count: number;
  avg_completion: number;
  created_at: string;
}

export interface ProgramDetailDTO extends ProgramDTO {
  phases: PhaseDTO[];
}

export interface ProgramMaterialDTO {
  id: string;
  program_id: string;
  uploaded_by: string;
  title: string;
  type: string;
  url: string;
  size_bytes?: number;
  created_at: string;
}

export const programsApi = {
  // Public listing â€” no auth required, used on the landing page
  listPublic: () =>
    api.get<ApiResponse<ProgramDTO[]>>(`/programs/public`),

  list: (orgId: string) =>
    api.get<ApiResponse<ProgramDTO[]>>(`/programs?org_id=${orgId}`),

  get: (id: string) =>
    api.get<ApiResponse<ProgramDetailDTO>>(`/programs/${id}`),

  create: (orgId: string, body: { title: string; description?: string; color?: string; duration_weeks?: number }) =>
    api.post<ApiResponse<ProgramDTO>>(`/programs?org_id=${orgId}`, body),

  update: (id: string, body: Partial<{
    title: string; description: string; color: string; is_open: boolean;
    duration_weeks: number; start_date: string; end_date: string;
    payment_required: boolean; price_amount: number; currency: string;
    gst_inclusive: boolean; gst_rate_bps: number;
  }>) =>
    api.patch<ApiResponse<ProgramDTO>>(`/programs/${id}`, body),

  // Self-enroll into an Open Program (marketplace) â€” lands the caller in the
  // default XA-LMS org. Requires auth.
  enroll: (id: string) =>
    api.post<ApiResponse<{ program_id: string; status: string }>>(`/programs/${id}/enroll`, {}),

  // provider is optional - a participant's manual choice; omitting it keeps
  // the backend's original currency-based routing (SelectProvider).
  createPaymentOrder: (programId: string, provider?: "razorpay" | "paypal") =>
    api.post<ApiResponse<PaymentOrderDTO>>(`/open-programs/${programId}/payment-orders`, provider ? { provider } : {}),

  verifyPayment: (body: PaymentVerificationRequest) =>
    api.post<ApiResponse<PaymentFinalizationDTO>>(`/payments/razorpay/verify`, body),

  // PayPal-only: triggers the real capture server-side after buyer approval.
  // Never finalizes/enrolls - the webhook is the source of truth for that;
  // call getPaymentOrderStatus afterward to poll until it completes.
  capturePaypalOrder: (paymentOrderId: string) =>
    api.post<ApiResponse<PaypalCaptureResultDTO>>(`/open-programs/payment-orders/${paymentOrderId}/capture-paypal`, {}),

  getPaymentOrderStatus: (paymentOrderId: string) =>
    api.get<ApiResponse<PaymentOrderStatusDTO>>(`/open-programs/payment-orders/${paymentOrderId}`),

  publish: (id: string) =>
    api.post<ApiResponse<ProgramDTO>>(`/programs/${id}/publish`, {}),

  duplicate: (id: string) =>
    api.post<ApiResponse<ProgramDTO>>(`/programs/${id}/duplicate`, {}),

  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/programs/${id}`),

  // Phases
  createPhase: (programId: string, body: { title: string; description?: string; phase_number: number; week_label?: string; color?: string; start_day?: number; end_day?: number; phase_type?: PhaseType; delivery_mode?: string }) =>
    api.post<ApiResponse<PhaseDTO>>(`/programs/${programId}/phases`, body),

  updatePhase: (programId: string, phaseId: string, body: Partial<{ title: string; description: string; phase_number: number; week_label: string; color: string; start_day: number; end_day: number; phase_type: PhaseType; delivery_mode: string }>) =>
    api.patch<ApiResponse<PhaseDTO>>(`/programs/${programId}/phases/${phaseId}`, body),

  deletePhase: (programId: string, phaseId: string) =>
    api.delete<ApiResponse<null>>(`/programs/${programId}/phases/${phaseId}`),

  // Modules (nested under a phase)
  createModule: (programId: string, phaseId: string, body: { title: string; delivery_mode?: "virtual" | "in-person"; session_date?: string }) =>
    api.post<ApiResponse<ModuleDTO>>(`/programs/${programId}/phases/${phaseId}/modules`, body),

  updateModule: (programId: string, phaseId: string, moduleId: string, body: Partial<{ title: string; delivery_mode: "virtual" | "in-person"; session_date: string }>) =>
    api.patch<ApiResponse<ModuleDTO>>(`/programs/${programId}/phases/${phaseId}/modules/${moduleId}`, body),

  deleteModule: (programId: string, phaseId: string, moduleId: string) =>
    api.delete<ApiResponse<null>>(`/programs/${programId}/phases/${phaseId}/modules/${moduleId}`),

  reorderPhases: (programId: string, phaseIds: string[]) =>
    api.post<ApiResponse<null>>(`/programs/${programId}/phases/reorder`, { phase_ids: phaseIds }),

  // Activities
  createActivity: (programId: string, body: { phase_id: string; module_id?: string; slot?: "pre" | "post"; title: string; description?: string; type: string; delivery_mode?: string; duration_mins?: number; due_day_offset?: number; start_day?: number; duration_days?: number; is_mandatory?: boolean; config?: ActivityConfig }) =>
    api.post<ApiResponse<ActivityDTO>>(`/programs/${programId}/activities`, body),

  updateActivity: (programId: string, actId: string, body: Partial<{ title: string; description: string; delivery_mode: string; duration_mins: number; due_day_offset: number; start_day: number; duration_days: number; is_mandatory: boolean; sort_order: number; config: ActivityConfig }>) =>
    api.patch<ApiResponse<ActivityDTO>>(`/programs/${programId}/activities/${actId}`, body),

  deleteActivity: (programId: string, actId: string) =>
    api.delete<ApiResponse<null>>(`/programs/${programId}/activities/${actId}`),

  // Org faculty list (simple id/name/email)
  listOrgFaculty: (orgId: string) =>
    api.get<ApiResponse<OrgFacultyMember[]>>(`/programs/faculty?org_id=${orgId}`),

  // Faculty full profiles for Roster tab
  listOrgFacultyProfiles: (orgId: string) =>
    api.get<ApiResponse<OrgFacultyProfile[]>>(`/programs/faculty/profiles?org_id=${orgId}`),

  // Faculty dashboard overview stats
  getFacultyDashboard: (orgId: string) =>
    api.get<ApiResponse<FacultyDashboardDTO>>(`/programs/faculty/dashboard?org_id=${orgId}`),

  // L1-L4 per-faculty summary
  getFacultyL1L4Summary: (orgId: string) =>
    api.get<ApiResponse<FacultyL1L4SummaryDTO[]>>(`/programs/faculty/l1l4?org_id=${orgId}`),

  // Update faculty profile
  updateFacultyProfile: (facultyId: string, body: {
    specialization?: string; bio?: string; phone?: string;
    location?: string; linkedin_url?: string; certifications?: string[];
    onboarding_status?: string;
  }) =>
    api.patch<ApiResponse<null>>(`/programs/faculty/${facultyId}/profile`, body),

  // Activity faculty assignment
  listActivityFaculty: (programId: string, actId: string) =>
    api.get<ApiResponse<ActivityFacultyDTO[]>>(`/programs/${programId}/activities/${actId}/faculty`),

  assignFaculty: (programId: string, actId: string, body: { faculty_user_id: string; role: string; cohort_id?: string; override_note?: string }) =>
    api.post<ApiResponse<ActivityFacultyDTO> & { data?: { has_conflict?: boolean; conflicts?: ConflictDTO[] } }>(`/programs/${programId}/activities/${actId}/faculty`, body),

  removeFaculty: (programId: string, actId: string, facultyUserId: string) =>
    api.delete<ApiResponse<null>>(`/programs/${programId}/activities/${actId}/faculty/${facultyUserId}`),

  // Faculty schedule calendar
  getFacultySchedule: (facultyId: string) =>
    api.get<ApiResponse<FacultyScheduleDay[]>>(`/programs/faculty/${facultyId}/schedule`),

  // All activities/programs a faculty member is assigned to deliver
  getFacultyAssignments: (facultyId: string) =>
    api.get<ApiResponse<FacultyAssignmentDTO[]>>(`/programs/faculty/${facultyId}/assignments`),

  // PM schedules a class_session for a specific activity
  listActivitySessions: (programId: string, actId: string) =>
    api.get<ApiResponse<ScheduledSessionDTO[]>>(`/programs/${programId}/activities/${actId}/sessions`),

  scheduleSession: (programId: string, actId: string, body: {
    program_id: string; cohort_id?: string; faculty_id: string;
    title: string; description?: string; session_type?: string;
    virtual_link?: string; scheduled_at: string; duration_mins?: number;
  }) =>
    api.post<ApiResponse<ScheduledSessionDTO>>(`/programs/${programId}/activities/${actId}/sessions`, body),

  // Program-level materials (not tied to a session)
  listMaterials: (programId: string) =>
    api.get<ApiResponse<ProgramMaterialDTO[]>>(`/programs/${programId}/materials`),

  addMaterial: (programId: string, body: { title: string; type: string; url: string; size_bytes?: number }) =>
    api.post<ApiResponse<ProgramMaterialDTO>>(`/programs/${programId}/materials`, body),

  deleteMaterial: (programId: string, materialId: string) =>
    api.delete<ApiResponse<null>>(`/programs/${programId}/materials/${materialId}`),
};
