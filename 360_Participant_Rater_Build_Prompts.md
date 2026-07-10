# 360° Feedback — Participant Side & Rater Form: Claude Code Build Prompts

Scope: adapting the existing participant-facing 360° experience to the admin-initiated model, and building the external rater-facing form that today's flow currently dead-ends into (invite/reminder emails have nowhere to send people yet).

Run in order. Attach the current participant-side UI screenshots when running Prompt 2 — they're the visual reference for what to preserve, not redesign.

---

## Prompt 1 — Audit (read-only, no code changes)

Read CLAUDE.md and FRONTEND_CLAUDE.md first.

Do not write any code yet. Audit and report back:

1. The existing participant-facing 360° Feedback component (likely `Feedback360Experience.tsx` or similar) — its three tabs (360 Results / Manage Raters / Response Tracker), how it currently determines quorum requirements, how a participant currently self-initiates a cycle, and how raters are added/tracked today.
2. The existing dashboard notification/bell system used elsewhere in the product (e.g. for faculty, coaching, or other alerts) — is there a reusable pattern for surfacing "you have something to act on" that a new 360° cycle assignment should plug into, rather than building a new mechanism.
3. The `feedback_raters` table and the public no-auth rater endpoints (`GET/POST /feedback_360/rater/:token`): how is the token currently generated (random, sequential, UUID?), does anything currently lock or expire it, and does the response payload already carry the cycle's locked competency/behavior/question snapshot plus the rater's category (Manager/Skip-Manager/Peer/Direct Report/Self/Others)?
4. Confirm current state of `feedback_quorum_config` and whether the participant-side quorum cards already read from it or from an old hardcoded/participant-set value.

Output a written report only.

---

## Prompt 2 — Adapt the Participant Experience

Read CLAUDE.md and FRONTEND_CLAUDE.md first. Use the Prompt 1 audit as source of truth — don't rebuild what already works. Screenshots of the current UI are attached as the visual reference: match them exactly, this is an adaptation, not a redesign.

Context: 360° cycles are now created and configured by Superadmin/Program Manager, not started by the participant. Adjust the existing component accordingly:

1. **Dashboard entry point** — when a participant has a row in `feedback_cycle_participants` for an active cycle, surface a "360° Feedback Cycle" notification ("Action needed: nominate your raters"). Extend the existing notification/bell system found in the audit rather than building a new one. Clicking it opens the existing 3-tab experience scoped to that cycle.
2. **Retire the old self-initiation path** — a participant can no longer start their own cycle; access depends entirely on being assigned one by an admin.
3. **Manage Raters tab** — Minimum Quorum Requirement cards must read from that cycle's `feedback_quorum_config` (set at Configure time by whoever created the cycle), not any old hardcoded or participant-set value. Only render a card for a category with a minimum >0.
4. **Add "Others" as a Relationship option** in the Add a Rater dropdown — currently only Manager / Peer / Direct Report / Skip Level exist.
5. **Wire real email sends** for "Add & Send Invite" and both "Send Reminder" actions (individual and "Send Reminder to All Pending") — reuse the existing SMTP infra (`api/pkg/email/email.go`). Point these at a placeholder route for the rater-facing link for now (`/rater/[token]` — built in Prompt 3); don't build that page here.
6. **Permission gating** for this screen must be enforced through the real route middleware — `users.role` checked against `permissionMatrix` in `shared/rbac.go` — not `custom_roles`/`role_assignments`, which isn't consulted by real enforcement.

360 Results and Response Tracker tabs stay visually as shown in the screenshots — just confirm they read from the cycle-scoped data model rather than whatever the old self-initiated flow used.

---

## Prompt 3 — Build the External Rater-Facing Form

Read CLAUDE.md and FRONTEND_CLAUDE.md first. Use the Prompt 1 audit findings for the token/endpoint starting point — don't assume, confirm from what was actually reported.

Build the external rater-facing form as a new public route (e.g. `/rater/[token]`), no auth required:

1. **Token security** — if the existing token isn't already a long, cryptographically random value (not sequential, not guessable), fix that first. This token is the entire security boundary for this page — there's no login behind it.
2. **Viewing must never invalidate the token.** Corporate email scanners (Outlook Safe Links, spam filters) pre-fetch links automatically before a human opens the email — if the token locks on first view, real raters will find it already "used." Only mark it used/locked on final submit.
3. **Already-submitted state** — if a token has already been submitted, show a read-only "already submitted, thank you" state instead of the form. No resubmission, no error, clean short-circuit.
4. **Invalid token state** — show a plain "this link isn't valid" message. Don't leak whether it's expired, never existed, or malformed.
5. **Render the form from the cycle's locked snapshot**: competencies, their behavior statements (this is the question — same text set at Configure time, not a separate copy), 1–5 scale plus "Unable to rate / Not observed" per statement, and the 3 open-ended questions once at the end (not per competency).
6. **Importance rating** shows only when the rater's category is Manager or Skip-Manager — omit entirely for Peer / Direct Report / Self / Others.
7. **Same phrasing for every category, including Self** — no first-person text transformation logic; keep the form category-agnostic.
8. **On submit**: write `feedback_responses` scoped to this rater + cycle, mark the rater row completed with a `submitted_at` timestamp, redirect to a simple thank-you confirmation.
9. **Abuse guard** — rate-limit submission attempts per token/IP; this is a public, unauthenticated endpoint.
10. **Close the loop** — update the invite/reminder emails from Prompt 2 to link here instead of the placeholder route.

Match FRONTEND_CLAUDE.md tokens — this page may be the rater's first-ever exposure to the product, so it needs to look credible and professional standalone, not assume familiarity with the rest of the LMS.
