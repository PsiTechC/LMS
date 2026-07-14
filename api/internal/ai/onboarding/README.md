# onboarding

Super Admin's Onboarding Automation Engine — workflow automation, not one of
the reusable AI reasoning engines.

`SuggestOrgSetup` (v1, done) — suggests industry/size/plan/seats/brand-kit
defaults for a brand-new organization's setup wizard, from the org name and
a freeform description. Read-only: never writes to the DB, never calls org
creation itself. The human still reviews the suggestion and submits the
existing `POST /organizations` request (gated `organizations:create`,
Superadmin-only) — this package has no path to that write beyond what the
caller already had.

Invitation sequencing (auto-inviting the admin/first users after org
creation) is deferred — separate write path, separate scope/review.
