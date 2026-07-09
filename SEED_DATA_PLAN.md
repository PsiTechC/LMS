# QA Seed Data — Consolidated Plan

Status: **awaiting sign-off** — no code written yet. This document folds together everything
confirmed across four research rounds against the actual codebase (not the CLAUDE.md doc, which
is stale in places — e.g. there is no `rbac_matrix.go`; the real file is `shared/rbac.go`).

---

## 1. Hierarchy (confirmed against code)

```
Organization (1 seed org, isolated from the 27 real users / 7 real custom_roles)
 └─ Programs (2-3, PM-managed, org-wide — no per-program PM scoping exists)
      └─ Program Phases (phase_type: pre-enrolment | orientation | module-virtual |
                          module-in-person | coaching | capstone | post-program | custom)
           └─ Program Modules (only inside module-virtual/module-in-person phases)
                └─ Activities (Slot: '' | pre | post — pre/post-work timing)
           └─ Activities directly (non-module phases attach activities straight to the phase)
      └─ Cohorts ("Batch" in your terms — the real timeline-bearing unit; no separate
                  Batch table exists in the schema)
           └─ Cohort Groups ("Cohort" sub-grouping in your terms — Coaching Circle /
                              Peer Triad / ALS Team, formed via a SEPARATE shuffle
                              mechanism from cohort-level randomize, see §6)
           └─ Enrollments (participant/faculty membership)
                └─ Activity Progress
           └─ Class Sessions (scheduled by PM against an activity + assigned faculty)
                └─ Session Attendance / Materials / Polls / Action Items / Reflections
 └─ Coaching Engagements (org-wide or program-scoped; individual or group;
                          coach = a `coaches` table row, auto-eligible if users.role='faculty')
 └─ Competencies → Feedback Cycles (360°) — NOT seeded via email-triggering endpoints
```

**Activity is the atomic content unit.** There is no separate "element" entity — "element" is
purely the Design Studio UI's label for an Activity sitting in a module's pre/post-work slot.
A `ContentAsset` (uploaded file/question set) is a real, separate entity that certain activity
types (video, pdf, case_study, assessment, survey) can *optionally* reference via
`config_json.asset_id` — app-level convention only, no DB foreign key enforces it.

**Delivery mode is two independent axes, not one:**
- Phase/Module `delivery_mode` (TEXT, `virtual`/`in-person`) — structurally settable on any
  phase type but only functionally consumed by module-type-phase UI/rendering.
- Activity `DeliveryMode` (Postgres ENUM, `self_paced`/`live`/`async`) — describes learner
  engagement mode, completely independent, zero cross-validation against the phase/module value.

---

## 2. RBAC reality (not what CLAUDE.md describes)

- **Real access control = `users.role` (single enum) checked against a static `permissionMatrix`**
  in `shared/rbac.go`, enforced by `RequirePermission` middleware
  (`shared/middleware.go:53`, `if !Can(claims.Role, resource, action)`).
- `custom_roles` / `role_assignments` tables are a **separate reporting/management layer**
  (the Role Management screen's "effective permissions" display) — **never consulted by the
  actual route middleware.** Seeding `role_assignments` rows does not grant real API access.
- **Faculty-who-is-also-Coach** = `users.role='faculty'` **+ a row in the `coaches` table**.
  Not a role_assignments trick. The coach roster query literally does
  `CASE WHEN u.role='faculty' THEN 'faculty' ELSE 'coach' END`.
- **`participant_retailer`** is a real `users.role` enum value — set directly on the user row,
  not a flag.
- **Program Manager access is org-wide**, not per-program — no `program_manager_id` column
  exists on `programs`; access gates purely on `users.role='program_manager'` + org membership.
- **No API endpoint exists to insert into the `coaches` table** except via an invite-accept
  email round-trip. This is a genuine gap in the API surface, not an oversight in this plan —
  handled as a direct-SQL exception (§5).

---

## 3. Timeline (~14 weeks span, anchored to today 2026-07-08)

| Program / Cohort | Status | Timing |
|---|---|---|
| **Program A** "Emerging Leaders" | `active` | |
| ↳ Cohort A1 "Not Started" | enrolled, 0 sessions done | starts **+2 weeks** |
| ↳ Cohort A2 "Mid-way" | some sessions done, some upcoming | started **-6 weeks**, ends **+6 weeks** |
| **Program B** "Executive Coaching Track" | `active` | |
| ↳ Cohort B1 "Completed" | all sessions completed, 100% | started **-14 weeks**, ended **-1 week** |
| **Program C** "New Manager Bootcamp" | `draft`/`upcoming` | exercises "not yet published" state |
| **Program D** "Digital Transformation Leadership" | `active` | starts **today** (day 0), ends **+10 weeks** |
| ↳ Cohort D1 "Kickoff" | enrolled, 0 sessions done | starts **today**, one orientation session scheduled **+3 days** |

Program D exists specifically to cover "genuinely hasn't started yet, full
program depth" — distinct from Program A (already mid-flight for weeks) and
Cohort A1 (a future *cohort* nested inside an already-active program, not a
program whose own day-0 is today). Same phase/module/pre-post-work richness
as Program A (pre-enrolment → orientation → 2 modules → coaching → capstone →
post-program), just re-dated so orientation is due this week and nothing has
been completed by anyone yet.

Cohort A2 (richest, mix of past+future):
- Week -6: orientation activities marked `completed` in `activity_progress`
- Week -5, -3: two `class_sessions` `status='completed'`, attendance marked, action items resolved
- Week -1: one coaching session delivered, a `coaching_notes` row
- Today/+1wk: one `class_sessions` `status='scheduled'`
- +3wk: scheduled coaching session, capstone activity not yet due

Phases/activities span the real enum values, not repeats:
`activity_type`: video, pdf, case_study, assessment, survey, live_session, coaching, journal,
assignment, peer_review (+ admin_task).

---

## 4. Isolation, idempotency, resettability

**Verified directly against the live shared VPS DB via `information_schema.referential_constraints`
(not restated from an earlier round's phrasing) — the cascade picture is mixed, not uniform:**

- Deleting the seed `organizations` row **does** cleanly cascade through every table FK'd
  directly to `organizations.org_id` (`programs`, `cohorts`, `coaching_engagements`, `content_assets`,
  `custom_roles`, `invitations`, `org_members`, `competencies`, `feedback_cycles`, etc. — all
  confirmed `CASCADE`), and transitively from there (`program_phases`→`programs` CASCADE,
  `activities`→`program_phases` CASCADE, `enrollments`→`cohorts` CASCADE, etc.).
- **`users` rows do NOT fully cascade-delete-safe once the org is gone.** Several FKs from
  data tables to `users` are `NO ACTION`, not `CASCADE` — confirmed: `programs.created_by`,
  `class_sessions.faculty_id`, `coaching_engagements.coach_id` and `.assigned_by`,
  `coaching_notes.participant_id` and `.faculty_id`, `feedback_cycles.created_by`,
  `participant_goals.faculty_id`, `submissions.participant_id` and `.graded_by`,
  `session_attendance.user_id`, `content_assets.created_by`, `invitations.invited_by`, and others.
  As long as those referencing rows were already removed by the `organizations` cascade (true for
  most, since e.g. `programs` cascades from `org_id` first), deleting `users` afterward is safe —
  but this is an **ordering dependency, not a guarantee**: `organizations` must be deleted
  **before** `users`, never the reverse, and any seed-created row that references a seed user but
  isn't itself reachable from the org cascade (there are currently none identified in this schema,
  but this was not exhaustively re-derived per-table) would block the `users` delete with a FK
  violation rather than silently orphaning data — which is the safe failure mode, but still means
  teardown is two ordered steps, not one blind cascade.
- **Teardown = direct SQL, in this order: (1) `DELETE FROM organizations WHERE slug=...`,
  (2) `DELETE FROM users WHERE email LIKE '%@<seed-domain>'`.** If step 2 ever fails on a FK
  violation, that surfaces a real leftover reference worth investigating, not something to
  paper over with a cascading force-delete.
- Rebuild = full re-run of the script (delete-then-recreate), not partial `ON CONFLICT` patching.
- Never wired into `InitSchema()` / `main.go` boot — a standalone program, run manually.

---

## 5. Execution mechanism — hybrid, 3 narrow direct-SQL exceptions

**Principle (per your direction): hit the real HTTP API as each persona**, so the service layer
computes derived state (completion %, counters) exactly as it would for a real user. Three gaps
in the API surface make a pure-API approach impossible; these are the *only* direct-SQL steps:

1. **User creation** (participants, PM, faculty roles needing bulk creation) — no email-safe API
   endpoint exists for plain `participant`/`program_manager` users
   (`POST /api/v1/auth/register` always fires a real verification email). Insert directly with
   bcrypt-hashed password, `is_verified=true`, `is_active=true`.
   - Exception within the exception: `POST /api/v1/faculty/onboard` with `send_welcome_email:false`
     IS a real, email-safe, API-only way to create faculty users — use it for the faculty
     personas instead of direct SQL.
2. **`coaches` table rows** — no API endpoint exists at all except via invite-accept email
   round-trip. Direct SQL insert for the 2-3 dedicated coach personas + the faculty+coach person.
3. **`coaching_engagements.completed_sessions` sync** — confirmed **live and read by 4 frontend
   screens** (Coach Dashboard, Coach Program Outline, PM Coaching Admin, Participant Coaching
   view), all trusting the raw stored column with zero server-side derivation from
   `class_sessions`. No API endpoint writes this field — ever. After creating the corresponding
   completed `class_sessions` rows (with `engagement_id` set), the script manually syncs this
   counter via direct SQL so those 4 screens render real numbers instead of "0/N".

Everything else — programs, phases, modules, activities, publish, faculty assignment, cohorts,
enrollment, sessions, attendance, coaching notes/goals, activity progress — goes through real
HTTP calls, authenticated as the appropriate persona's JWT.

---

## 6. Confirmed endpoint sequence (per module)

**Bootstrap (direct SQL, §5 exceptions only):** org, users, org_members, coaches rows.

**Programs (PM/Superadmin JWT):**
`POST /programs` → `PATCH /programs/:id` (backdate start_date/end_date — created_at itself is
NOT caller-settable, always server-stamped) → `POST /programs/:id/phases` → `POST .../modules`
(module-type phases only) → `POST /programs/:id/activities` → `POST /programs/:id/publish`.

**Faculty assignment — CORRECTED (user flagged, verified against frontend):** the Design
Studio's `POST /programs/:id/activities/:actId/faculty` (`assignFacultyService`) is **dead code
from the real product's perspective** — `PMDesignStudio.tsx` hardcodes `isSessionType = false`
with an explicit comment that faculty assignment was intentionally removed from Program Design
("now handled exclusively from the standalone Sessions page" / Faculty Management tab). The
REAL, live flow a PM uses is the Faculty Management tab's "Manage Faculty Access" modal, which
calls `POST /faculty_assignments/program` (`faculty_management` module) — a **program-level**
access grant (`{faculty_user_id, program_id}`), not a per-activity pick. Server-side,
`assignProgramService` resolves its own "representative activity" for the program
(`firstActivityForProgram`, preferring a `coaching`-type activity, else lowest `sort_order`) and
inserts exactly one `activity_faculty` row via a separate code path
(`faculty_management/repository.go`, `insertActivityFaculty`) — distinct from the `programs`
module's `assignFacultyService`, which the seed script no longer calls at all. This must run
AFTER at least one activity exists on the program (the resolver has nothing to pick otherwise).

**Session scheduling — canonical PM-driven route, not the faculty self-service route:**
`POST /programs/:id/activities/:actId/sessions` (`scheduleSessionService`) — handler doc-comment
literally states *"This is the canonical way sessions are created — faculty just read these rows
on their dashboard."* `faculty_id` is a required field the PM sets, ideally matching someone
already assigned via the step above (not currently enforced by the backend, but followed here
to match the intended design). The alternate `POST /sessions` route (self-service, faculty forced
to `faculty_id=callerID`) exists and is real, but is deliberately NOT used in the seed script,
since it doesn't match the PM-schedules/faculty-reads model this system is designed around.

**Faculty (JWT, read + lifecycle actions only):** `PATCH /sessions/:id` (`status:"completed"`
shortcut — confirmed to skip start/end lifecycle validation entirely, safe to use for backdating
past sessions) → `POST /sessions/:id/attendance` (confirmed to have NO session-status
precondition — can mark attendance on a session in any status).

**Cohorts (PM/Superadmin JWT):** `POST /cohorts` (start_date/end_date freely backdatable at
creation) → `POST /cohorts/:id/participants` / `/bulk` / `:id/enroll` (all three confirmed
email-safe — zero `email`/`communications` import anywhere in the cohorts module).

**Cohort formation — two distinct mechanisms; only one is actually exercised by the script:**
- `POST /cohorts/distribute` (`randomDistributeService`) — cohort-level reshuffle that withdraws
  **every** currently-enrolled participant across **every** cohort of the program and round-robins
  them back. **Revised decision:** the seed script does NOT call this against Program A, because
  doing so would scramble the deliberately-built not-started/mid-way/manual cohort timeline this
  seed exists to demonstrate — proving the endpoint works isn't worth destroying that. The actual
  frontend wizard ("Setup Cohorts & Allocate") performs its "Randomize" shuffle client-side and
  commits via repeated manual-transfer calls anyway — it does NOT appear to call this backend
  endpoint — so calling it here would prove less than it costs. If you want to see this endpoint
  in action, call it by hand against a disposable program you don't need to preserve.
- `POST /cohorts/:id/groups` / `/groups/reshuffle` — a SEPARATE cohort_group-level shuffle
  (Coaching Circle / Peer Triad / ALS Team), scoped within one already-formed cohort. Seed at
  least one cohort via manual per-participant assignment, and form cohort_groups in it via this
  shuffle mechanism.

**Coaching (JWT):** `POST /coaching/admin/engagements` (assigning a coach does NOT email them,
confirmed) → `POST /coaching/coach/notes`, `POST /coaching/notes`, `POST /coaching/goals`.

**Progress (participant JWT):** drive `activity_progress`/`submissions` endpoints organically so
`completion_percent` is computed server-side, not hand-set via the PATCH shortcut (which would
be silently overwritten the next time real progress is recorded anyway).

---

## 7. Email safety — full audit, all 26 planned endpoints, zero sends confirmed

Every endpoint in the sequence above was traced handler → service → every called function,
checking for `email.Send` (direct, via helper, or via goroutine) and for imports of
`pkg/email` / `internal/communications` / `internal/invitations` / `internal/feedback360`.
**Result: 0 of the 26 planned calls send email.** The two originally-flagged risk endpoints
(`/api/v1/invitations*`, `/api/v1/auth/register`) are excluded from the seed script entirely — they
remain available for you to test manually against your owned domain if desired.

**New risk surfaced this round, not present in the original two-item list:** the
`communications` module runs an **hourly background ticker** (`StartRuleEvaluator`, started once
at server boot) that evaluates any **active** `automation_rules` rows against live data
(`completion_below_pct`, `cohort_starts_in_N_days`, `assessment_failed`, etc.) and calls
`email.Send` for real matches, rate-limited once per 24h per rule+user. This is NOT triggered by
any of the 26 seed calls directly — it only fires if `automation_rules` already has active rows.

**Confirmed by reading `listActiveRules()` (`communications/repository.go:172-176`): the evaluator
scans `WHERE is_active = true` with NO `org_id` filter at all** — despite `automation_rules.org_id`
being a real column, the query is global across every org on the instance. So this is not a
"only matters if the seed org itself has a rule" risk — a rule created for ANY org on the shared
VPS runs against the whole DB's live data every hour, and could match rows the seed script creates
regardless of which org they belong to (the trigger's own target-user lookup is presumably scoped
by the rule's `org_id`, but that hasn't been re-derived per trigger_type here — treat as unproven
either way).

**Live-checked against the shared VPS DB directly (`SELECT COUNT(*) FROM automation_rules` /
`WHERE is_active = true`) as of this writing: 0 rows total, 0 active.** Clean today — but this is
a point-in-time fact, not a standing guarantee, since anyone can create a rule before the seed
script actually runs later. **This check is therefore built into the seed script itself as a
hard pre-flight guard, not left as a manual reminder:** before the script writes anything, it
runs `SELECT COUNT(*) FROM automation_rules WHERE is_active = true` against the target DB and
**aborts immediately with a non-zero exit and no writes** if the count is anything other than 0.
If a real active rule ever needs to coexist with seeding, that's a deliberate decision to unblock
by hand (e.g. temporarily flip it inactive), not something the script silently works around.

**`SMTP_HOST` is confirmed live** in `api/.env` — there is no dev/dry-run mode in `email.Send()`.
Fake seed emails must use a domain you own (not `example.com`, per your preference), not real
personal inboxes. 3-4 real addresses you own are fine to use for hands-on QA of invite/OTP flows.

---

## 8. `completed_sessions` — decision (not a default)

Confirmed **live and read** by 4 frontend screens (Coach Dashboard, Coach Program Outline, PM
Coaching Admin, Participant Coaching view) as both a progress-bar percentage and a raw "X/Y"
count. Confirmed **never written by any Go service function** — stays at DB default (0) forever
otherwise. **Decision: sync it manually via direct SQL** (§5, exception 3) after creating the
matching completed `class_sessions` rows, so these 4 screens render real data instead of "0/N"
everywhere — directly serving the stated goal of these screens "having something to render."

---

## 9. Known limitations / things this plan does not solve

- The random cohort-distribute backend endpoint and the UI wizard's actual shuffle behavior are
  not proven to be the same code path — flagged above, not resolved. Manual UI click-through
  still recommended for that specific flow during QA. **Separately worth flagging to the dev
  team on its own** (outside this seed effort): either `POST /cohorts/distribute` is dead code
  nobody wired the wizard to, or it's called from somewhere else not yet traced — worth someone
  confirming which, so it doesn't quietly rot either way.
- `activity_faculty` assignment is not enforced as a hard precondition by `createSessionService`
  — the seed script follows the *intended* design (assign-then-schedule) but the backend itself
  wouldn't reject it if done out of order. Not a seed-script bug; a pre-existing backend gap.
- The session-level "Breakout Groups" randomize feature (faculty dashboard, ephemeral, unrelated
  to `cohort_groups` persistence) is out of scope for this seed plan.
- Teardown ordering (`organizations` first, then `users`) is a real constraint now proven against
  the live DB (§4), not just a style preference — the script must not delete `users` first.
- **`coaching_notes.session_id` has no `ON DELETE CASCADE`** (migrations/000007_faculty.up.sql:69
  — unlike `session_materials`/`session_attendance` on the same table, which do cascade). Once the
  seed script has run once (it creates a `coaching_notes` row in the mid-way cohort step), the
  `organizations` cascade alone can no longer delete `class_sessions` on a subsequent `-reset` or
  re-run — it 23503s. Fixed in `resetSeedData` (db.go): explicitly deletes this seed org's
  `coaching_notes` rows (scoped by session → cohort → program → org join) before the
  `organizations` delete. This is a real, pre-existing schema gap, not a seed-script bug — worth
  fixing at the schema level too (`ALTER TABLE coaching_notes ... ON DELETE CASCADE`) so any org
  deletion, not just this script's, doesn't hit the same wall.
- **Discussions RBAC**: `participant_retailer` has no `discussions:create` permission
  (`rbac.go` `participantRetailerAllow` — discussions is a deliberately locked tab for retailers).
  `participantEmails()` returns both `participant` and `participant_retailer` roles, so any script
  step picking an arbitrary cohort member for a discussions call must filter to role exactly
  `"participant"` first (see `plainParticipantUserIDs` in discussions.go) or risk a 403 landing on
  a retailer persona.

**Optional, free QA coverage (not a requirement):** since the two delivery-mode axes (phase/module
`virtual`/`in-person` vs. Activity `self_paced`/`live`/`async`) are confirmed to have zero
cross-validation anywhere in the service layer (§1, §2), it's worth deliberately seeding one or
two activities with a mismatched combination (e.g. a `self_paced` activity inside an
`in-person` module) — that's realistically what real user data entry will eventually produce
anyway, and costs nothing extra to include now.

---

## 10. Open items before code starts

1. Exact seed email domain/convention (you own the domain; local-part convention TBD when we
   write the script — e.g. `qa-seed+name@yourdomain.com`).
2. ~~Confirm `automation_rules` state~~ — **closed**: live-checked against the shared VPS DB at
   0 total/0 active rows (§7), and a hard pre-flight abort-on-nonzero check is now specified as
   part of the script itself, not a manual step to remember.
3. Script format: standalone Go program under `api/cmd/seed/`, HTTP client against a running
   local server — confirm this is still the preferred shape.
