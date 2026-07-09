# QA Seed Data

Populates one isolated organization with realistic Programs/Cohorts/Sessions/Coaching data for
manual QA. Full design rationale, FK order, RBAC findings, and email-safety audit live in
`/SEED_DATA_PLAN.md` at the repo root — read that first if anything here is unclear.

## What this does

1. Connects directly to the DB (`DB_URL` from `api/.env`) to:
   - Abort immediately if any `automation_rules` row is `is_active = true` (global scan, no
     org filter exists in the real evaluator — see plan §7).
   - Create the seed `organizations` row + all seed `users` rows (bcrypt password, pre-verified)
     + `org_members` + `coaches` table rows. These are the only steps that bypass the API,
     because no email-safe API path exists for them (plan §5).
2. Logs in as each seeded persona (`POST /api/v1/auth/login`) and drives everything else —
   programs, phases, modules, activities, publish, faculty assignment, cohort creation,
   enrollment, session scheduling, attendance, coaching engagements/notes/goals, activity
   progress, content library uploads, and discussion threads/replies — through the real HTTP
   API, so the service layer computes derived state (completion_percent, etc.) exactly as it
   would for a real user.
3. Syncs `coaching_engagements.completed_sessions` directly via SQL at the end (plan §8 — no
   API endpoint ever writes this column, but 4 frontend screens read it).

## Running it

Requires the API server already running (`cd api && air`) and reachable at `API_BASE_URL`
(defaults to `http://localhost:8080`).

```bash
cd api
go run ./cmd/seed          # build the seed data
go run ./cmd/seed -reset   # tear down the seed org + seed users, then exit (no rebuild)
```

## Resetting

`-reset` deletes, in this order (per plan §4 — order matters, `organizations` must go first):
1. `DELETE FROM organizations WHERE slug = '<seed-org-slug>'` (cascades through nearly everything)
2. `DELETE FROM users WHERE email LIKE '%@qa.psitech.co.in'` (the fake bulk persona domain)

The 7 real psitech.co.in/convis.ai persona emails are NOT deleted by `-reset` — they're real
people's addresses reused across runs, not seed-only rows. Re-running the seed after a reset
recreates them idempotently (delete-if-exists-by-email, then recreate) rather than erroring on
a duplicate.

## Real vs fake identities

| Real email (yours) | Persona |
|---|---|
| tejas@psitech.co.in | Superadmin |
| vaishnavi@psitech.co.in | Program Manager |
| rohit@psitech.co.in | Faculty + Coach (dual role) |
| chirag@psitech.co.in | Faculty |
| akanksha@psitech.co.in | Coach (dedicated, org-wide) |
| tejas@convis.ai | Participant |
| siddhesh@convis.ai | Participant Retailer |

All other ~20 participants/faculty use `firstname.lastname@qa.psitech.co.in` — a subdomain of a
domain you own, so if `email.Send` ever fires against one by accident it's visible/traceable to
you rather than bouncing into a stranger's inbox or vanishing silently.

Default password for every seeded user: `QaSeed!2026` (see `const seedPassword` in `main.go`).
