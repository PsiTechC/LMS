# 360° Feedback — Admin-Initiated Flow: Claude Code Build Prompts

Scope: Superadmin, Superadmin Secondary, Program Manager. Participant-side (choosing raters, tracking, report view) is a separate future build — do not touch it here beyond what's needed to not break it.

Run these in order. Don't skip the audit — approve its output before Prompt 2 runs any migration.

---

## Prompt 1 — Audit (read-only, no code changes)

Read CLAUDE.md and FRONTEND_CLAUDE.md first.

Context: We're changing 360° Feedback from participant-initiated to admin-initiated. Superadmin (and Superadmin Secondary) and Program Manager will configure and launch 360° cycles; participants will only manage their own rater list and track progress — that part is built later, separately.

Do not write any migration or code yet. Audit and report back:

1. Current schema for `feedback_cycles`, `feedback_raters`, `feedback_responses`, `feedback_cycle_competencies`, and the competencies module (`competencies`, `activity_competencies`, `program_templates`). For each: columns, whether it's already org-scoped (`org_id` or equivalent), and any FK to `activities` or `batches`.
2. How `feedback_360:write` and related permission keys are currently defined in `rbac.go`, which personas hold them, and whether Superadmin Secondary's locked-tab config touches 360° at all.
3. Anything set up specifically for the old participant-initiated flow that becomes dead weight under an admin-initiated flow (e.g. participant-only write gates, missing org scoping on competencies). List these as flagged candidates for a later cleanup migration — don't drop anything yet.
4. Confirm whether `competencies` are currently global (shared across all orgs) or already per-org.
5. Confirm current state of `activities.type` enum re: `feedback_360` (known to not be a real enum value as of last check).
6. For the Assign step, we need to filter participants by **Program** (and Cohort, where that program has cohorts) — not by Batch. Trace and report the actual relationship between `users`/participants, `programs`, `batches`, and `cohorts` in the current schema, so we have the correct join path before building the filter query in Prompt 3.

Output a written report only.

---

## Prompt 2 — Migrations & data model

Read CLAUDE.md and FRONTEND_CLAUDE.md first. Use the audit report from Prompt 1 as source of truth for what already exists — only add what's actually missing. Additive-only migrations, never destructive. No dummy/seed data.

Target end-state:

- **Competencies & behavior statements**: org-scoped if not already (`org_id` on `competencies`). Each behavior statement gets a `question_text` column (nullable text) alongside its existing statement text — this holds the finalized rater-facing question wording, distinct from the internal behavior label.
- **`feedback_cycles`**: add `name` (required, e.g. "Q3 2026 Leadership 360"), `org_id`, `status` (draft → configuring → locked → active → completed), `initiated_by_user_id`, `initiated_by_role` (superadmin / program_manager), `locked_at` (nullable, set on confirm). Design the status field so a future "reopen for edit" admin action is a small addition, not a rebuild — don't hardcode locking as irreversible at the schema level.
- **`feedback_quorum_config`**: per-cycle row (skip_manager, manager, peer, direct_report, others; self is fixed at 1, not stored), settable by whoever configures that cycle — Superadmin or Program Manager, same access, no tiering between them. Optionally store the org's most recently used values as a convenience default to pre-fill new cycles — not an enforced floor, just a starting point.
- **`feedback_cycle_participants`**: `cycle_id`, `participant_id`, `added_at`, `invited_at`, `status` (assigned / invited / in_progress / completed), plus a denormalized `program_id` and `cohort_id` snapshot at assignment time for filtering/reporting. No FK tying the whole cycle to one program — participants from any program, any cohort, or none, can land in the same cycle.
- **RBAC**: new permission keys `feedback_360:configure` and `feedback_360:assign`, granted to Superadmin, Superadmin Secondary, and Program Manager. Leave the existing participant-facing permission key alone — just make sure the new admin keys don't collide with it.

GORM models per the five-file module pattern.

---

## Prompt 3 — Backend APIs

Read CLAUDE.md first. Five-file module pattern (handler, service, repository, model, dto) inside `api/internal/feedback360/`. No cross-module Go imports — call other modules' APIs if you need batch/cohort participant data.

Build, scoped by JWT identity:

- **Competency framework CRUD** (competencies + behavior statements + `question_text`) — org-scoped. Superadmin passes/selects `org_id`; Program Manager is auto-scoped to their own org from the JWT.
- **Quorum config** — writable by both Superadmin and Program Manager as part of configuring a cycle, same `feedback_360:configure` permission as the competency framework edits.
- **Cycle CRUD** — create draft, update while draft/configuring, lock (sets `locked_at`, flips status, snapshots the competency/behavior/quorum config used so later edits to the org's live framework don't retroactively affect an already-locked cycle).
- **Participant listing for Assign** — filterable by Program, Cohort (only surfaced when the selected program actually has cohorts), and enrollment status. Supports "select all" against whatever filter combination is active, including no filter (whole org). Org-scoped same as above. Use the participant → Program join path confirmed in the Prompt 1 audit.
- **Assign/invite** — bulk-assign selected participants to a cycle, insert `feedback_cycle_participants` rows, fire an in-app notification + invite email (reuse the existing SMTP infra in `api/pkg/email/email.go` — this is a real send, not a timestamp stamp). Must support adding more participants to an already-live cycle later without duplicating existing ones.
- **Reminder** — same in-app + email pattern for participants who haven't completed.

Exclude AI-generated content — the existing rule-based narrative/report generation stays as-is, out of scope here.

---

## Prompt 4 — Frontend: Configure Wizard

Read FRONTEND_CLAUDE.md first for design tokens. Look at the existing Program Manager Analytics dashboard and Cohort Management enrollment screen for table/tab/filter patterns already in use — match them, don't introduce new visual patterns. Navy `#1C2551` / coral `#EF4E24`.

Build a multi-step Configure wizard, gated by `feedback_360:configure`:

1. **Org picker** — Superadmin/Superadmin Secondary only, required before continuing. Program Manager skips straight to step 2, org already set.
2. **Cycle basics + competencies** — name field, then a competency + behavior editor. Per competency: name, definition, and its behavior statements. Each behavior statement has its own "Question" input directly below it, with the behavior statement always shown as static reference text above that input. Interaction: when the Question input is empty and receives focus via Tab from the behavior statement field, auto-fill it with the behavior statement text as a starting point, editable after — don't keep overwriting it once the admin has typed something of their own.
3. **Quorum** — skip-manager, manager, peer, direct-report, others as editable fields (self fixed at 1, not shown as an input). Both Superadmin and Program Manager can set these values here, no tiering between the two. Pre-fill with the org's most recently used values if available, purely as a convenience starting point.
4. **Review & Lock** — summary of everything configured, a clear "Lock & Continue to Assign" action calling the lock endpoint. Copy should make clear locking freezes this cycle's config, and that reopening after lock is a separate admin action not yet exposed on this screen.

Check for an existing wizard/modal component before building a new one.

---

## Prompt 5 — Frontend: Assign Step & Cycle Dashboard

Read FRONTEND_CLAUDE.md first. Match existing table and filter-bar components already used in Program Manager/Superadmin screens.

Build, gated by `feedback_360:assign`:

1. **Cycle dashboard** — this org's 360° cycles (draft/active/completed), named, with basic progress stats (assigned, invited, completed counts).
2. **Assign screen** — participant table for the org with filters: Program, Cohort (only appears once a program with cohorts is selected), enrollment status, plus a direct search box. "Select all" respects whatever filter combination is active — with no filters applied, it selects the whole org. Multi-select checkboxes and individual selection both supported.
3. **Invite action** — assigns selected participants, fires in-app notification + invite email per participant. Re-runnable later on the same cycle to add more participants without duplicating or re-inviting existing ones.
4. **Per-participant status tracking** — invited / in progress / completed, with a Remind action (individual or bulk) that sends a real in-app notification + email — replacing the old timestamp-only stub.

No deadline/expiry field — cycles stay open until quorum is met.
