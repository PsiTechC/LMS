import { api, ApiResponse } from "./api";

export interface EngagementPoint {
  week_number: number;
  week_label: string;
  engagement_pct: number;
}

export interface CompetencyScore {
  id: string;
  cohort_id: string;
  competency_id: string;
  title: string;
  category: string;
  pre_program_pct: number;
  current_pct: number;
  updated_at: string;
}

export interface ProgramOverview {
  total_programs: number;
  active_programs: number;
  draft_programs: number;
  delivered_programs: number;
  total_cohorts: number;
  total_participants: number;
  at_risk_count: number;
  avg_completion: number;
}

export interface ParticipantProgress {
  user_id: string;
  name: string;
  email: string;
  department: string;
  enrolled_at: string;
  completion_percent: number;
  risk_level: "low" | "medium" | "high";
  enrollment_status: string;
  sessions_attended: number;
  total_sessions: number;
  submissions_graded: number;
  total_submissions: number;
  last_active: string | null;
}

export interface CohortProgressResponse {
  cohort_id: string;
  participants: ParticipantProgress[];
  summary: { total_enrolled: number; at_risk_count: number; avg_completion: number };
}

export interface ActivityCompletionRow {
  activity_id: string;
  title: string;
  activity_type: string;
  total_participants: number;
  completed_count: number;
  completion_pct: number;
  avg_score: number | null;
  overdue_count: number;
  phase_name: string;
}

export interface ActivityCompletionResponse {
  cohort_id: string;
  activities: ActivityCompletionRow[];
}

export interface SessionAttendanceRow {
  session_id: string;
  title: string;
  scheduled_at: string;
  total_expected: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  attendance_rate: number;
  duration_mins: number;
}

export interface AttendanceHeatmapResponse {
  cohort_id: string;
  sessions: SessionAttendanceRow[];
  overall_rate: number;
}

export interface GradeBucket { label: string; count: number }

export interface ActivityGradeStats {
  activity_id: string;
  title: string;
  avg_grade: number;
  pending_count: number;
  graded_count: number;
  buckets: GradeBucket[];
}

export interface SubmissionGradesResponse {
  cohort_id: string;
  activities: ActivityGradeStats[];
}

export interface SessionSummary {
  cohort_id: string;
  total_scheduled: number;
  total_delivered: number;
  total_hours: number;
  avg_duration_mins: number;
  action_items_open: number;
  action_items_closed: number;
  action_items_overdue: number;
  poll_participation_rate: number;
}

// ── New interfaces ────────────────────────────────────────

export interface PhaseCompletionRow {
  phase_id: string;
  phase_name: string;
  phase_number: number;
  total_activities: number;
  completed_activities: number;
  completion_pct: number;
}

export interface TypeCompletionRow {
  activity_type: string;
  total_activities: number;
  completed_count: number;
  completion_pct: number;
  avg_score: number;
}

export interface CompletionRollup {
  cohort_id: string;
  overall_pct: number;
  by_phase: PhaseCompletionRow[];
  by_type: TypeCompletionRow[];
}

export interface EngagementSummaryRow {
  user_id: string;
  name: string;
  email: string;
  login_count: number;
  activities_started: number;
  activities_completed: number;
  avg_progress_pct: number;
}

export interface EngagementSummaryResponse {
  cohort_id: string;
  participants: EngagementSummaryRow[];
}

export interface AssessmentPerformer {
  user_id: string;
  name: string;
  email: string;
  avg_grade: number;
  submitted: number;
  graded: number;
}

export interface AssessmentPerformanceResponse {
  cohort_id: string;
  cohort_avg: number;
  top_performers: AssessmentPerformer[];
  low_performers: AssessmentPerformer[];
}

export interface AtRiskParticipant {
  user_id: string;
  name: string;
  email: string;
  risk_level: "medium" | "high";
  completion_percent: number;
  sessions_attended: number;
  total_sessions: number;
  activities_overdue: number;
  days_since_activity: number;
}

export interface AtRiskResponse {
  cohort_id: string;
  participants: AtRiskParticipant[];
}

export interface ProgramCohortRow {
  cohort_id: string;
  cohort_name: string;
  start_date?: string;
  end_date?: string;
  total_enrolled: number;
  avg_completion: number;
  at_risk_count: number;
  sessions_delivered: number;
  sessions_scheduled: number;
}

export interface ProgramSummaryResponse {
  program_id: string;
  total_cohorts: number;
  total_participants: number;
  avg_completion: number;
  at_risk_count: number;
  total_sessions: number;
  sessions_delivered: number;
  avg_competency_improvement: number;
  cohorts: ProgramCohortRow[];
}

export interface CompetencyImprovementRow {
  competency_id: string;
  title: string;
  category: string;
  pre_program_pct: number;
  current_pct: number;
  improvement_pct: number;
  improvement_abs: number;
}

export interface ROIResponse {
  cohort_id: string;
  avg_improvement: number;
  competencies: CompetencyImprovementRow[];
}

export interface RiskDistribution {
  high_count: number;
  medium_count: number;
  low_count: number;
  label: "Low" | "Moderate" | "High";
}

export interface OrganizationAnalyticsRow {
  organization_id: string;
  organization_name: string;
  total_programs: number;
  total_learners: number;
  avg_completion: number;
  avg_engagement: number;
  at_risk_count: number;
}

export interface ProgramAnalyticsExtraResponse {
  program_id: string;
  engagement_pct: number;
  weekly_engagement: EngagementPoint[];
  activity_breakdown: TypeCompletionRow[];
  completion_by_phase: PhaseCompletionRow[];
  risk_distribution: RiskDistribution;
}

export interface CohortHealthScore {
  cohort_id: string;
  score: number;
  label: string;
  narrative: string;
}

export interface OverallGradeResponse {
  participant_id: string;
  program_id: string;
  overall_pct: number | null; // null = no graded items yet
  graded_item_count: number;
  assessment_avg_pct: number | null;
  capstone_avg_pct: number | null;
  assignment_avg_pct: number | null;
}

export const analyticsApi = {
  engagement: (cohortId: string) =>
    api.get<ApiResponse<EngagementPoint[]>>(`/analytics/engagement?cohort_id=${cohortId}`),

  // AI Cohort Intelligence Brief - real attendance/at-risk/competency-gap
  // data synthesized into a pre-session narrative. On-demand (LLM call).
  cohortBrief: (cohortId: string) =>
    api.post<ApiResponse<{ brief: string }>>(`/analytics/cohort-brief?cohort_id=${cohortId}`, {}),

  // AI Cohort Health Score - PM-facing composite score + narrative, same
  // aggregation sources as the Cohort Intelligence Brief. On-demand (LLM
  // call) per cohort, fired on drill-down rather than for every cohort card.
  cohortHealthScore: (cohortId: string) =>
    api.post<ApiResponse<CohortHealthScore>>(`/analytics/cohort-health-score?cohort_id=${cohortId}`, {}),

  competencyScores: (cohortId: string) =>
    api.get<ApiResponse<CompetencyScore[]>>(`/analytics/competencies?cohort_id=${cohortId}`),

  upsertCompetencyScore: (body: {
    cohort_id: string; competency_id: string; pre_program_pct: number; current_pct: number;
  }) => api.post<ApiResponse<null>>("/analytics/competencies", body),

  deleteCompetencyScore: (id: string) =>
    api.delete<ApiResponse<null>>(`/analytics/competencies/${id}`),

  programOverview: (orgId: string) =>
    api.get<ApiResponse<ProgramOverview>>(`/analytics/program-overview?org_id=${orgId}`),

  cohortProgress: (cohortId: string) =>
    api.get<ApiResponse<CohortProgressResponse>>(`/analytics/cohort-progress?cohort_id=${cohortId}`),

  activityCompletion: (cohortId: string) =>
    api.get<ApiResponse<ActivityCompletionResponse>>(`/analytics/activity-completion?cohort_id=${cohortId}`),

  attendanceHeatmap: (cohortId: string) =>
    api.get<ApiResponse<AttendanceHeatmapResponse>>(`/analytics/attendance-heatmap?cohort_id=${cohortId}`),

  submissionGrades: (cohortId: string) =>
    api.get<ApiResponse<SubmissionGradesResponse>>(`/analytics/submission-grades?cohort_id=${cohortId}`),

  sessionSummary: (cohortId: string) =>
    api.get<ApiResponse<SessionSummary>>(`/analytics/session-summary?cohort_id=${cohortId}`),

  completionRollup: (cohortId: string) =>
    api.get<ApiResponse<CompletionRollup>>(`/analytics/completion-rollup?cohort_id=${cohortId}`),

  engagementSummary: (cohortId: string) =>
    api.get<ApiResponse<EngagementSummaryResponse>>(`/analytics/engagement-summary?cohort_id=${cohortId}`),

  assessmentPerformance: (cohortId: string) =>
    api.get<ApiResponse<AssessmentPerformanceResponse>>(`/analytics/assessment-performance?cohort_id=${cohortId}`),

  atRisk: (cohortId: string) =>
    api.get<ApiResponse<AtRiskResponse>>(`/analytics/at-risk?cohort_id=${cohortId}`),

  roi: (cohortId: string) =>
    api.get<ApiResponse<ROIResponse>>(`/analytics/roi?cohort_id=${cohortId}`),

  programSummary: (programId: string) =>
    api.get<ApiResponse<ProgramSummaryResponse>>(`/analytics/program-summary?program_id=${programId}`),

  programAnalyticsExtra: (programId: string) =>
    api.get<ApiResponse<ProgramAnalyticsExtraResponse>>(`/analytics/program-analytics-extra?program_id=${programId}`),

  // "All Programs" scope - same response shape, aggregated across every
  // program in the org (program_id comes back "" and completion_by_phase
  // comes back empty, since phases aren't comparable across programs).
  orgSummary: (orgId: string) =>
    api.get<ApiResponse<ProgramSummaryResponse>>(`/analytics/org-summary?org_id=${orgId}`),

  orgAnalyticsExtra: (orgId: string) =>
    api.get<ApiResponse<ProgramAnalyticsExtraResponse>>(`/analytics/org-analytics-extra?org_id=${orgId}`),

  organizationRollup: () =>
    api.get<ApiResponse<OrganizationAnalyticsRow[]>>("/analytics/organization-rollup"),

  // AI Insight - one-line card on the Analytics page (engagement/completion/
  // at-risk). On-demand (LLM call), fetched on page load. orgId/programId may
  // both be "" (platform-wide / all programs).
  aiInsight: (orgId: string, programId: string) =>
    api.post<ApiResponse<{ insight: string }>>(`/analytics/ai-insight?org_id=${orgId}&program_id=${programId}`, {}),

  overallGrade: (participantId: string, programId: string) =>
    api.get<ApiResponse<OverallGradeResponse>>(`/analytics/overall-grade?participant_id=${participantId}&program_id=${programId}`),
};
