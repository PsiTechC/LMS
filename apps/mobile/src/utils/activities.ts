import type { ActivityDTO, ModuleDTO, PhaseDTO, ProgramDetailDTO, SubmissionDTO } from '../types/api';

/**
 * Shared activity-tree helpers. Ported logic from
 * apps/web/app/dashboard/participant/page.tsx (flattenActivities,
 * isSubmittable, titleCase) — same rules, not the same markup.
 */

export function getPhaseActivities(phase: PhaseDTO | undefined): ActivityDTO[] {
  if (!phase) return [];
  const moduleActs = (phase.modules ?? []).flatMap((m: ModuleDTO) => [...(m.pre ?? []), ...(m.post ?? [])]);
  return [...(phase.activities ?? []), ...moduleActs].filter((a) => a.type !== 'admin_task');
}

export function flattenActivities(program: ProgramDetailDTO | null): ActivityDTO[] {
  if (!program) return [];
  return (program.phases ?? []).flatMap((phase) => getPhaseActivities(phase));
}

// The real, cross-type completion signal (survey_completions/submissions/
// assessment_attempts/activity_progress union) — see api/internal/programs/
// completion.go. Falls back to the submissions map only if `completed` is
// entirely absent.
export function isActivityDone(activity: ActivityDTO, submissions: Record<string, SubmissionDTO | null>): boolean {
  return activity.completed ?? Boolean(submissions[activity.id]);
}

const SUBMITTABLE_TYPES = ['assessment', 'survey', 'journal', 'assignment', 'peer_review', 'capstone', 'feedback_360', 'discussion'];
export function isSubmittable(type: string): boolean {
  return SUBMITTABLE_TYPES.includes(type);
}

export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export type PhaseStatus = 'done' | 'locked' | 'active';

export function phaseStatus(phase: PhaseDTO, submissions: Record<string, SubmissionDTO | null>): PhaseStatus {
  if (phase.locked) return 'locked';
  const acts = getPhaseActivities(phase);
  if (acts.length > 0 && acts.every((a) => isActivityDone(a, submissions))) return 'done';
  return 'active';
}
