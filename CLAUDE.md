# XA-LMS — Learning Management System

AI-powered Leadership Development Platform by Executive Acceleration Learning.



IMPORTANT NOTE : Please use 'elev8-reference.jsx' file placed in root for any UI reference. Ensure whatever you build frontend is aligned or reffered to this Referecnce UI file. it has everything. 
**Repo:** https://github.com/PsiTechC/LMS.git

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Go 1.23+ + Echo v4 |
| Web | Next.js 14 + Tailwind + shadcn/ui |
| Mobile | React Native + Expo |
| Database | PostgreSQL 16 + pgvector |
| Cache | Redis 7 |
| AI | OpenAI / Azure OpenAI / Ollama |
| Storage | AWS S3 |
| Email | AWS SES |

---

## Module Structure

Every backend module lives under `api/internal/{module}/` and follows the strict 5-file pattern. No exceptions.

```
api/internal/{module}/
├── handler.go      — HTTP handlers only: parse request, call service, write response
├── service.go      — all business logic and orchestration
├── repository.go   — database queries only, no business logic
├── model.go        — GORM structs (maps to DB tables)
└── dto.go          — request/response structs with validation tags
```

### Module Rules

- **Modules never import each other's packages.** If module A needs data from module B, it calls B's HTTP API endpoint — not B's Go package.
- **Shared code only lives in `api/internal/shared/`.** This includes middleware, DB client, Redis client, config, error types, and response helpers. Any change to `shared/` must be discussed with the team before merging.
- **One module per domain.** Examples: `auth`, `programs`, `cohorts`, `assessments`, `surveys`, `feedback`, `coaching`, `notifications`, `gamification`, `ai`, `certificates`.
- Repository functions return models. Service functions return DTOs. Handlers touch neither models nor raw DB.

---

## API Conventions

### Check Before Building

Before writing a new endpoint, search the codebase first:

```bash
grep -r "v1/your-resource" api/internal/
```

If the endpoint already exists, use it. If the response shape doesn't fit your needs, extend it — don't duplicate it. Creating two endpoints that return the same resource is a violation.

### URL Structure

```
/v1/{resource}              — collection
/v1/{resource}/:id          — single item
/v1/{resource}/:id/{action} — non-CRUD action
```

Resources are **plural nouns in snake_case**: `/v1/programs`, `/v1/cohort_groups`, `/v1/assessment_attempts`.

Actions that aren't standard CRUD use a verb suffix:

```
POST /v1/assessments/:id/submit
POST /v1/enrollments/:id/withdraw
POST /v1/feedback_cycles/:id/close
POST /v1/certificates/:id/issue
```

### HTTP Methods

| Operation | Method | Example |
|-----------|--------|---------|
| List (paginated) | GET | `GET /v1/programs?page=1&per_page=20` |
| Get one | GET | `GET /v1/programs/:id` |
| Create | POST | `POST /v1/programs` |
| Partial update | PATCH | `PATCH /v1/programs/:id` |
| Delete | DELETE | `DELETE /v1/programs/:id` |
| Action | POST | `POST /v1/assessments/:id/submit` |

Never use PUT. Always use PATCH for updates.

### Standard Response Envelope

Every endpoint returns this exact shape:

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 150
  },
  "error": null
}
```

For lists, `data` is an array. For single items, `data` is an object. `meta` is omitted for non-paginated responses.

Error response:

```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email is required",
    "field": "email"
  }
}
```

Error codes are `SCREAMING_SNAKE_CASE`. Common codes: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`.

### Response Helpers

Use the shared helpers — never write `c.JSON(...)` manually in a handler:

```go
return shared.OK(c, data)
return shared.OKList(c, data, meta)
return shared.Created(c, data)
return shared.NoContent(c)
return shared.BadRequest(c, "VALIDATION_ERROR", "email is required", "email")
return shared.NotFound(c, "program not found")
return shared.Forbidden(c)
```

### IDs

All primary keys are UUIDs. Never use sequential integer IDs in API responses.

---

## RBAC — Permissions

Every route must use `RequirePermission`. There are no unprotected routes except `/v1/auth/*` and `/v1/certificates/:code/verify`.

```go
// Route registration pattern
g := e.Group("/v1/programs", middleware.RequireAuth())
g.GET("", h.List,   middleware.RequirePermission("programs", "read"))
g.POST("", h.Create, middleware.RequirePermission("programs", "create"))
g.PATCH("/:id", h.Update, middleware.RequirePermission("programs", "update"))
g.DELETE("/:id", h.Delete, middleware.RequirePermission("programs", "delete"))
```

**Permission format:** `{resource}:{action}`

Common actions: `read`, `create`, `update`, `delete`, `grade`, `manage`, `admin`.

The full role → permission mapping is in `api/internal/shared/rbac_matrix.go`. If you need a new permission, add it there — don't check roles directly in handler or service code.

```go
// ❌ Never do this
if user.Role == "program_manager" { ... }

// ✅ Always do this — check via the permission middleware on the route
```

---

## Activity Type System

The `activities` table is the **core configurable building block** of the entire platform. Every step in a program journey is an activity.

```sql
-- activities.type enum
content | assessment | survey | feedback_360 | coaching | capstone | discussion
```

Each activity type has a `config_json` whose schema is type-specific. When building a new feature that lives inside a program, you extend an existing activity type's config — **you do not add a new table for a new program step type**.

Config schemas are defined in `api/internal/programs/activity_configs.go`. Every type has a corresponding `Validate()` method that runs when an activity is created or updated.

Example config for an `assessment` type activity:

```json
{
  "assessment_id": "uuid",
  "attempts_allowed": 3,
  "time_limit_mins": 60,
  "cooling_off_hours": 24,
  "scoring_method": "highest"
}
```

---

## AI Provider

The AI provider is controlled entirely by environment variables. **Zero code changes are required to switch providers.**

```env
AI_PROVIDER=openai          # openai | azure | ollama
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
AI_BASE_URL=                # required only for azure or ollama
```

All LLM calls go through `api/internal/ai/provider.go`. Never import an OpenAI or Azure SDK directly from business logic or any module other than `ai`.

### Tool Calling

The AI agent uses typed function tools — never raw SQL or direct DB access.

```go
// Tool registry is in api/internal/ai/tools.go
// Each tool wraps an existing service function
// toolsForRole(role) returns only the tools that role is allowed to call
```

Context injection (user profile, current phase, upcoming deadlines) is built in `api/internal/ai/context_builder.go` and injected into every chat request's system prompt.

### Proactive Nudges

Proactive AI messages are driven by rows in the `proactive_rules` table. Adding a new trigger type means adding a row — not new code.

Redis rate limiting key: `nudge:{user_id}:{rule_id}:{YYYY-MM-DD}` — TTL expires at midnight.  
Hard limit: 3 proactive messages per user per day. Quiet hours: 22:00 – 08:00 (user's timezone).

---

## Feature Flags

Incomplete or experimental features must be behind a feature flag. The main branch must always be demo-able.

```go
if org.FeatureEnabled("ai_coach") {
    // feature code
}
```

Flags are stored in `organizations.feature_flags` (JSONB). The helper method lives in `api/internal/shared/feature_flags.go`.

When you start a new feature: add the flag, build behind it, remove the flag check when the feature is stable and tested.

---

## Environment Setup

### Prerequisites

| Tool | Windows | Mac |
|------|---------|-----|
| Go 1.23+ | https://golang.org/dl | `brew install go` |
| Node.js 20 LTS | https://nodejs.org | `brew install node` |
| Docker Desktop | https://docker.com | https://docker.com |
| Git | https://git-scm.com | `brew install git` |

After installing Go, open a new terminal:

```bash
go install github.com/air-verse/air@latest
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```

Install **Expo Go** on your phone (App Store or Play Store) for mobile development.

---

### Clone & Configure

```bash
git clone https://github.com/PsiTechC/LMS.git
cd LMS
```

**Windows:**
```powershell
copy .env.example api\.env
copy .env.example apps\web\.env.local
```

**Mac:**
```bash
cp .env.example api/.env
cp .env.example apps/web/.env.local
```

Fill in `api/.env`:

| Key | Value |
|-----|-------|
| `AI_PROVIDER` | `openai` or `azure` or `ollama` |
| `AI_API_KEY` | Your API key |
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |

> **Windows only — PostgreSQL port conflict:** If PostgreSQL is installed locally it will conflict with Docker on port 5432. Create a `.env` file in the project root (not `api/.env`) containing `POSTGRES_PORT=5433`, then update `DB_URL` in `api/.env` to use port 5433.

---

### Install Dependencies

```bash
cd api && go mod download && cd ..
cd apps/web && npm install && cd ../..
cd apps/mobile && npm install && cd ../..
```

---

### Start

Open Docker Desktop and wait for it to fully start, then:

```bash
docker compose up -d
```

Verify both services are healthy:

```bash
docker compose ps
```

Open three terminals:

```bash
# Terminal 1 — API (schema is applied by Go InitSchema() on startup — see Database Migrations)
cd api && air

# Terminal 2 — Web
cd apps/web && npm run dev

# Terminal 3 — Mobile (if needed)
cd apps/mobile && npx expo start
```

- API: http://localhost:8080
- Web: http://localhost:3000
- Mobile: scan QR with Expo Go. Replace `localhost` in `apps/mobile/.env` with your machine's local IP (`ipconfig` on Windows / `ifconfig` on Mac).

---

## Daily Workflow

```bash
# Every morning — run in order
docker compose up -d
git pull origin main
cd api && air
```

Schema changes are applied by Go `InitSchema()` code on API startup (idempotent — see the **Database Migrations** section). No manual migrate command is needed after a pull. Note: the `.sql` files in `api/migrations/` are a historical record and do **not** run automatically.

---

## Branch & PR Rules

```bash
# Create a branch
git checkout -b feat/module-name

# Commit
git add .
git commit -m "feat: short description of what changed"
git push origin feat/module-name
```

**Branch prefixes:**

| Prefix | Use for |
|--------|---------|
| `feat/` | New feature or module |
| `fix/` | Bug fix |
| `migration/` | Schema change only (no feature code) |
| `chore/` | Config, deps, tooling |

**PR rules — a PR is not mergeable if:**

- It touches another developer's module directory (raise an issue instead)
- It changes `api/internal/shared/` without team discussion
- The module's service layer has no unit tests
- Migration files are missing from a PR that adds new tables
- It adds a new endpoint that duplicates an existing one

---

## Database Migrations

> **Important — how schema changes actually apply in this repo.**
> The `.sql` files in `api/migrations/` are **NOT run automatically**. Nothing in the
> codebase reads them (no `golang-migrate`, no embed, no `schema_migrations` table).
> They are kept as a reference record of schema history only. The database is often a
> **shared/remote instance** (see `DB_URL` in `api/.env`) that already has most tables,
> so schema changes must be **idempotent and applied from Go on startup.**

Schema is created and evolved by Go code that runs when the API boots:

1. **Per-module `InitSchema()`** — each module that owns tables has an `init.go` with an
   `InitSchema()` that runs `CREATE TABLE IF NOT EXISTS …` (and `ALTER TABLE … ADD COLUMN
   IF NOT EXISTS …`). It's called from `main.go` right after the handler is registered.
2. **Ad-hoc blocks in `main.go`** — cross-cutting tweaks (e.g. dropping a `NOT NULL`) use
   an idempotent `DO $$ … IF EXISTS/IF NOT EXISTS … $$` guard so they're safe to re-run.

### Adding a schema change

- **New table(s) for your module:** add/extend your module's `InitSchema()` with
  `CREATE TABLE IF NOT EXISTS`, and call it from `main.go`. Use `IF NOT EXISTS` everywhere.
- **Alter an existing table** (add column, drop a constraint): use an idempotent guard.
  For a column add: `ALTER TABLE t ADD COLUMN IF NOT EXISTS …`. For a constraint change,
  wrap it in a `DO $$ BEGIN IF … THEN … END IF; END $$` that checks
  `information_schema` first — see the `invitations.cohort_id` / `class_sessions.cohort_id`
  blocks in `api/cmd/server/main.go` for the exact pattern.
- **Also add a matching `.sql` file** under `api/migrations/` for the historical record
  (next sequential number, `.up.sql` + `.down.sql`). It won't run, but keep the paper trail.

Rule of thumb: every schema statement must be safe to run on a database that **already
has** the change. Never write a bare `CREATE TABLE` or `ALTER TABLE … ADD COLUMN` without
the `IF [NOT] EXISTS` guard — it will crash the boot on the shared DB.

> **Migration file numbering:** if you add a `.sql` file, use the next unused sequential
> number. Do not reuse an existing number — duplicate version numbers break the
> `golang-migrate` CLI for anyone who runs it manually.

---

## Troubleshooting

**"password authentication failed" on startup**
→ Local PostgreSQL is conflicting with Docker on port 5432.
→ Windows: run `Stop-Service postgresql-x64-18 -Force` in an admin PowerShell, or use `POSTGRES_PORT=5433` in root `.env`.

**"No such container: xa_lms_db"**
→ Docker is not running. Open Docker Desktop, wait for the whale icon to stop animating, then `docker compose up -d`.

**"not a valid application for this OS platform" (Windows)**
→ Go PIE build mode issue. Already fixed in `.air.toml` with `-buildmode=exe`. If it recurs, confirm the flag is present in that file.

**Expo not connecting to API on phone**
→ Replace `localhost` in `apps/mobile/.env` with your machine's local IP address.
→ Windows: `ipconfig` → Mac: `ifconfig`

**API crashes on startup with a SQL error**
→ A schema statement in a module's `InitSchema()` or a `main.go` block failed — usually a
non-idempotent `CREATE TABLE` / `ALTER TABLE … ADD COLUMN` running against the shared DB
that already has the object. Make the statement idempotent (`IF NOT EXISTS`, or an
`information_schema` guard — see **Database Migrations**), then restart. There is no
`schema_migrations` table in this repo, so there is no dirty-state row to clear.

**Docker port conflict on 5432 or 6379**
→ Something else is using the port.
→ Windows: `netstat -ano | findstr :5432`
→ Mac: `lsof -i :5432`

# Repository Directives & Security Guardrails

## 🛡️ Critical Security Rules (Zero-Tolerance)
- **NO HARDCODED SECRETS:** NEVER generate, commit, or hardcode API keys, passwords, database credentials, or JWT secrets. Always look for existing `.env` or configuration patterns.
- **SQL INJECTION:** ALL database queries MUST use parameterized queries or object-relational mapping (ORM) abstractions. NEVER concatenate user input into raw SQL strings.
- **INPUT VALIDATION & SANITIZATION:** Treat all external parameters (GET/POST inputs, headers, URL params) as untrusted. You MUST explicitly use the repository's validation schemas (e.g., Zod, Joi) before handling data logic.
- **CROSS-SITE SCRIPTING (XSS):** When writing UI elements, you MUST safely escape or sanitize dynamic user-submitted strings before rendering them to the DOM.

## 🛠️ Secure Development Workflow
- **DEPENDENCY MANAGEMENT:** Before recommending or installing any third-party npm/pip/cargo library, you MUST explicitly state the package name and explain why it is safe and necessary. Never introduce unverified dependencies.
- **ERROR HANDLING:** Production code MUST use try/catch blocks for network, file, and database operations. Fail gracefully. NEVER leak full stack traces or internal server errors back to the client interface.

## 📝 Pre-Commit Security Checklist
Before declaring a code change "complete," you must verify that the diff satisfies the following constraints:
1. Does it bypass authentication or authorization checks?
3. Have you written corresponding unit tests to verify the bounds of the new input validation rules?


IMPORTANT NOTE : Always try to build smart relationships, smart systems. Ensure the system, schemas and code is smartly written and maintained. 