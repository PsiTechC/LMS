# XA-LMS — Learning Management System

AI-powered Leadership Development Platform by Executive Acceleration Learning.

IMPORTANT NOTE: Use `elev8-reference.jsx` (repo root) as the UI reference for any frontend work. Every screen you build should align with it. See also `apps/CLAUDE.md` for the full design token system (colors, spacing, component patterns).

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

The AI provider is controlled entirely by environment variables. **Zero code changes are required to switch providers** — OpenAI, Azure OpenAI, and local Ollama all speak the same OpenAI-compatible wire format.

```env
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini         # default model; per-tier overrides: AI_MODEL_CLASSIFY, AI_MODEL_REASON, AI_MODEL_DEEP_REASON, AI_MODEL_EMBED
AI_BASE_URL=                 # required only for azure or ollama; defaults to https://api.openai.com/v1
```

All LLM calls go through `api/internal/ai/provider` (`Config`, `Resolve(scope, tier)`, `Complete`, `Stream`, `Embed`). `Complete` supports native OpenAI-style tool/function calling (`WithTools`, `WithToolChoice`) — pass tools, inspect `Result.ToolCalls`, execute, and feed results back as `ChatMessage{Role:"tool", ToolCallID:...}`. Never import an OpenAI/Azure SDK or read `AI_*` env vars directly from business logic or any module other than `provider` itself — always call `provider.Resolve` for a `Config`.

### Shared Chatbot Core + Per-Role Tools

`api/internal/ai/chatbot` is the one chat engine every persona uses — there is no per-role chat implementation. `chatbot.Answer(ctx, scope, systemPrompt, history, tier, onDelta)` runs the agentic loop: call the model with that role's tools, execute any tool calls the model requests (each `Tool.Run` receives `scope.Scope` and must filter its query by `scope.UserID`/`scope.Role` — never by a model-supplied argument), feed results back, repeat up to `maxToolRounds`, then stream the final answer to `onDelta`. A role with no tools registered gets a plain streamed chat with no behavior change.

**Adding a new role's capabilities is additive only** — write `api/internal/ai/chatbot/tools/<role>.go` with an `init()` that calls `chatbot.Register(shared.Role<X>, tool1, tool2, ...)`, blank-import it once (already done in `internal/ai/service.go`). The loop, provider wiring, and HTTP/SSE surface never change per role. See `chatbot/tools/participant.go` for the reference implementation (10 tools: profile, enrollments, activity progress, submissions, goals, upcoming sessions, coaching, feedback360, capstone, surveys, plus `search_resources` which calls `rag.Retrieve`). Tools read domain tables directly via `pkg/database` raw SQL (the established `internal/ai/*` convention — see below), never by importing a domain module's Go package.

Coach/Faculty/Program Manager/Superadmin tool sets are not built yet — next step is a `chatbot/tools/coach.go` etc. following the same pattern, no core changes required.

### Shared AI Engines

Every persona-facing AI feature is a thin, scope-restricted call into one of the shared engines below (`api/internal/ai/{engine}/`) — never a bespoke per-role implementation. Every engine call takes a `scope.Scope{OrgID, ProgramID, UserID, Role}` (built via `scope.Build`) and a `provider.Tier` — narrower personas (Participant Retailer, Superadmin Secondary) are a narrower `Scope`, not a separate code path. Engines read domain tables directly via raw SQL against `pkg/database` rather than importing domain modules' Go packages — this is the accepted convention specifically for `internal/ai/*` (documented here, not a violation of the "modules never import each other" rule, which governs domain-to-domain calls).

| Engine | Status | Notes |
|---|---|---|
| `provider` | done | `Config`/`Resolve`/`Complete` (+ tool calling)/`Stream`/`Embed`. |
| `scope` | done | `Scope` struct + `Build` (org resolution via `org_members`). |
| `chatbot` | done (v1, participant) | Shared agentic chat core + per-role tool registry. Powers `/v1/ai/conversations/:id/messages`. Participant tools done; other roles are additive follow-up. |
| `rag` | done (v1) | Real pgvector retrieval — `ai_doc_chunks` table, `Index`/`Retrieve` (used by `chatbot`'s `search_resources` tool). Indexes `content_assets` text. |
| `riskscoring` | done (v1, rule-based) | `Scorer` interface + `RuleBasedScorer`; `ai_risk_scores` table; `StartNightlyBatch` runs every 24h (goroutine+ticker from `main.go`, same convention as `systemhealth`/`communications`). No trained model yet. |
| `rubric` | done (v1) | `Grade` — JSON-mode completion against a file-based prompt template. No persistence (caller owns storage). |
| `aggregate` | done (v1) | `GenerateBrief` — only `KindCohortIntelligence` has a real metrics query so far; other kinds (ROI narrative, platform advisor, cross-org benchmarks) are role-by-role follow-up. |
| `recommend` | done (v1, rule-based) | `Recommender` interface + `RuleBasedRecommender` (next incomplete activity in program order). No trained model yet. |
| `notify` | done (v1) | `ShouldFire` cooldown/debounce decision layer (`ai_notify_cooldowns` table) + `Dispatcher` interface. Actual delivery not wired — will call into `communications`' HTTP API when a concrete caller needs it. |
| `classify` | done (v1) | `Classify` — JSON-mode completion against a fixed taxonomy. No persistence (caller owns storage). |
| `anomaly` | scaffold only | Empty package + README — deferred (infra/security signals, not learner behavior). |
| `onboarding` | scaffold only | Empty package + README — deferred (workflow automation, not a reasoning engine). |

Prompt templates live in `{engine}/prompts/*.tmpl` files (loaded via `go:embed`), not inline Go strings — editable without a Go code change, redeploy still required to pick up an embedded template change.

No full per-role feature build-out yet (e.g. Faculty Grading Assist UI, PM Dropout Prediction dashboard) — this phase built the shared engine layer only. ASR/speech-to-text is explicitly out of scope.

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

## Critical Security Rules (Zero-Tolerance)

- **NO HARDCODED SECRETS:** Never generate, commit, or hardcode API keys, passwords, DB credentials, or JWT secrets. Use `api/.env` / `apps/web/.env.local` — follow the existing config patterns.
- **SQL INJECTION:** All queries go through GORM or parameterized raw SQL (`pkg/database` with `$1, $2, …` placeholders). Never concatenate user input into a SQL string — this applies everywhere, including the `internal/ai/*` engines that use raw SQL by convention (see AI Provider section).
- **INPUT VALIDATION:** DTOs (`dto.go`) carry `validate` tags and are validated in the handler before reaching `service.go`. Treat all request bodies, query params, and headers as untrusted. On the web, validate form input with the project's existing schema pattern before submission.
- **XSS:** Never use `dangerouslySetInnerHTML` (React/Next.js) with unsanitized user content. Rely on React's default escaping; if raw HTML rendering is unavoidable, sanitize first.
- **RBAC:** Every route carries `RequirePermission` (see RBAC section above) — never gate access with an `if user.Role == "..."` check in handler/service code.

## Secure Development Workflow

- **DEPENDENCIES:** Before adding a new Go module or npm package, state the package name and why it's needed. Don't add a dependency when the stdlib or an existing project dependency already covers it.
- **ERROR HANDLING:** Go handlers return errors via the `shared` response helpers (`shared.BadRequest`, `shared.NotFound`, `shared.Forbidden`, etc.) — never leak a raw Go error or stack trace into an HTTP response body; log it server-side and return a clean `error.message`. On the web, wrap network/data calls so a failed request shows a user-facing error state instead of an unhandled exception.

## Pre-Commit Checklist

Before calling a change complete, verify:
1. It doesn't bypass an auth/RBAC check.
2. New input validation has a corresponding test covering its boundaries.
3. No secret, credential, or `.env` value was added to a tracked file.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph (always use when available)

`code-review-graph` is set up per-machine (its MCP config lives in a gitignored
`.mcp.json`), so it is not guaranteed to be available in every session — but
**whenever it is available, always use it first** for codebase exploration,
impact analysis, and code review instead of Grep/Glob/Read. It's faster,
cheaper (fewer tokens), and gives structural context (callers, dependents,
test coverage) that file scanning can't. **If it is not available, fall back to
Grep/Glob/Read as normal** — do not tell the user tools are missing or ask them
to install anything.

### When to use graph tools FIRST (if available)

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read whenever the graph tools aren't registered, or when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---

## Specialized Agents

`.claude/agents/` holds role-specific subagent definitions for this repo. **Use them proactively whenever a task matches their scope — don't wait to be asked by name.** Launch via the `Agent` tool with `subagent_type` set to the agent's name.

| Agent | Use for |
|---|---|
| `Code Reviewer` | Reviewing a diff or PR for correctness, security, maintainability before considering work done |
| `Frontend Developer` | Implementing or modifying Next.js/React Native UI (`apps/web`, `apps/mobile`) |
| `UI Designer` | Visual/component design work that must match `apps/CLAUDE.md` tokens and `elev8-reference.jsx` |
| `UX Architect` | Structuring a new screen/flow's layout and CSS system before implementation |
| `Database Reliability Engineer` | Schema changes, `InitSchema()` migrations, anything touching data availability/integrity |
| `Test Automation Engineer` | Writing/fixing Playwright or Cypress e2e tests |
| `API Tester` | Validating a new or changed `/v1/...` endpoint's request/response contract |

Rules of thumb:
- Any non-trivial backend module change (new endpoint, schema change, RBAC change) → run the `Code Reviewer` agent on the diff before calling it done, per the **Pre-Commit Checklist** above.
- Any frontend screen or component work → check `apps/CLAUDE.md` and `elev8-reference.jsx` first, then use `Frontend Developer` (and `UI Designer`/`UX Architect` for new layouts) rather than freehanding styles.
- Schema/migration work → route through `Database Reliability Engineer` given the idempotent, shared-DB constraints in **Database Migrations** above.
- Don't spawn an agent for trivial one-file edits — reserve these for tasks matching their actual scope.
