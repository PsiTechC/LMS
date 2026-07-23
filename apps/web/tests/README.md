# Responsive E2E tests

`responsive.spec.ts` is a Playwright smoke test verifying no page-level
horizontal overflow at 320×700, 375×812 (mobile), 768×900 (tablet), and
1366×768 (desktop) across 19 routes/tabs spanning every role, plus two
interaction-driven checks (opening a modal, opening a dropdown) at the two
mobile widths.

Runs with a single worker deliberately (see `playwright.config.ts`) — this
suite targets a locally-running, single-instance dev API server, and
multiple concurrent workers were observed to produce intermittent 500s on
unrelated endpoints purely from request load, not a real app bug.

## Prerequisites

1. Start the API on `http://localhost:8080`:
   ```bash
   cd api && air
   ```
2. Start the web app on `http://localhost:3000`:
   ```bash
   cd apps/web && npm run dev
   ```
3. Ensure the QA seed data exists (idempotent — safe to re-run):
   ```bash
   cd api && go run ./cmd/seed
   ```
4. Run the suite:
   ```bash
   cd apps/web && npm run test:e2e
   ```

Screenshots land in `test-results/responsive/<route>-<viewport>.png`
(gitignored — not committed).

## Seeded test accounts

The suite logs in via `POST /api/v1/auth/login` directly (no UI login flow)
using accounts created by `api/cmd/seed`. These are **QA-fixture accounts
for the isolated seed organization only** — not production credentials.
The shared password for every seeded account is printed to the console each
time the seed command runs (`api/cmd/seed/db.go`'s `seedPassword` constant);
see `api/cmd/seed/personas.go` for the full account list. One account per
role used by this suite:

| Role | Persona |
|---|---|
| Participant | `tejas@convis.ai` |
| Faculty | `rohit@psitech.co.in` |
| Coach | `akanksha@psitech.co.in` |
| Program Manager | `vaishnavi@psitech.co.in` |
| Superadmin | `tejas@psitech.co.in` |

If these accounts don't exist yet in your local/shared database, run the
seed command in step 3 above — it's safe to re-run at any time.

## Known, narrowly-excluded failure

`GET /api/v1/branding/current` returns `403` for the `coach` role — a
pre-existing backend permissions gap (unrelated to responsive layout,
tracked separately, not fixed by this suite). The exclusion in
`responsive.spec.ts` matches only this exact method + status + path,
**and only when logged in as the coach persona** — any other failed
request, for any other role/route, still fails the suite.
