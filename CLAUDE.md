# XA-LMS — Claude Code Instructions

These rules apply to every session. Read this fully before making any changes.

---

## Project Overview

This is XA-LMS, an AI-powered Leadership Development LMS built with:
- **Backend:** Go 1.23 + Echo v4 (api/)
- **Web:** Next.js 14 App Router + Tailwind + shadcn/ui (apps/web/)
- **Mobile:** React Native + Expo (apps/mobile/)
- **Database:** PostgreSQL 16 + pgvector via GORM
- **Cache:** Redis 7
- **AI:** OpenAI / Azure OpenAI / Ollama — switched via env vars only, never hardcoded

---

## Non-Negotiable Rules

### 1. Database Changes — Always Write Migration Files

**Any time you add a table, add a column, remove a column, change a type, or add an index:**

You MUST create SQL migration files. Never use GORM AutoMigrate.

```bash
migrate create -ext sql -dir api/migrations -seq description_of_change
```

This creates two files. You must write SQL in both:

```
api/migrations/XXXXXX_description.up.sql   ← CREATE TABLE / ALTER TABLE
api/migrations/XXXXXX_description.down.sql ← DROP TABLE / ALTER TABLE (reverse)
```

Always commit migration files in the same commit as the model and handler code.
Never leave a migration file empty.
Never edit a migration file that has already been committed.

---

### 2. Go Module Structure — Every Module Has Exactly 5 Files

Every feature module lives in `api/internal/{module}/` with exactly these files:

```
api/internal/{module}/
├── handler.go      ← Echo HTTP handlers only. No business logic. No DB calls.
├── service.go      ← Business logic only. No direct DB calls. Calls repository.
├── repository.go   ← GORM database queries only. No logic.
├── model.go        ← GORM struct that maps to database table.
└── dto.go          ← JSON request and response structs only.
```

Never mix these responsibilities. A handler never calls GORM directly.
A repository never contains business logic.

---

### 3. AI Provider — Never Hardcode

Never hardcode OpenAI, Azure, or any AI provider URL or key.
Always read from environment variables:

```go
cfg := openai.DefaultConfig(os.Getenv("AI_API_KEY"))
cfg.BaseURL = os.Getenv("AI_BASE_URL")
```

Supported values in .env:
```
# Ollama local
AI_BASE_URL=http://localhost:11434/v1
AI_API_KEY=ollama
AI_MODEL=qwen2.5:32b

# Azure OpenAI
AI_BASE_URL=https://YOUR.openai.azure.com/openai/deployments/gpt-4o
AI_API_KEY=your_key
AI_MODEL=gpt-4o

# OpenAI
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

---

### 4. Environment Variables — Never Commit Secrets

Never write actual keys, passwords, or secrets in any file that is committed.
Always use os.Getenv().
Actual values go in api/.env which is gitignored.
If adding a new env variable, add it to .env.example with an empty or example value.

---

### 5. API Routes — Always Under /api/v1/

All routes must be registered under the v1 group:
```go
v1 := e.Group("/api/v1")
authHandler.Register(v1)
```

Never create routes outside this group.

---

### 6. Windows Build — Always Use -buildmode=exe

In api/.air.toml the build command must always be:
```toml
cmd = "go build -buildmode=exe -o ./tmp/main.exe ./cmd/server"
bin = "./tmp/main.exe"
```

Never remove -buildmode=exe. This is required because Go 1.24+ defaults to PIE
which requires gcc. Without this flag the binary will fail on Windows.

---

### 7. Migrations Run Automatically

The API applies migrations automatically on startup via api/pkg/database/postgres.go.
Do not tell developers to run migrate manually for local dev.
After a git pull, starting the API is enough.

---

### 8. Error Handling

Always return structured JSON errors. Never return plain text errors from handlers.

```go
// Correct
return c.JSON(http.StatusBadRequest, map[string]string{
    "error": "email is required",
})

// Wrong
return c.String(http.StatusBadRequest, "email is required")
```

---

### 9. New Dependencies

Before adding any new Go package, check if something already in go.mod covers the need.
After adding a dependency run:
```bash
go mod tidy
```

Never leave unused imports or dependencies.

---

### 10. Branch and Commit Rules

Every change goes on a feature branch:
```bash
git checkout -b feat/module-name
```

Commit message format:
```
feat: add users module
fix: correct enrollment status update
chore: add migration for cohorts table
```

Never commit directly to main.

---

## Database Schema Reference

All planned tables are documented in:
```
api/migrations/SCHEMA_MAP.md
```

Check this before creating any new table to avoid naming conflicts
and to understand how domains relate to each other.

---

## Current Module Status

Track which modules are built here as work progresses:

| Module | Status | Owner |
|---|---|---|
| auth | pending | - |
| user | pending | - |
| organization | pending | - |
| program | pending | - |
| enrollment | pending | - |
| content | pending | - |
| assessment | pending | - |
| coaching | pending | - |
| feedback360 | pending | - |
| leaderboard | pending | - |
| notification | pending | - |
| ai | pending | - |
| analytics | pending | - |

Update status to `in progress` or `done` as modules are built.
Update owner to the developer's name working on it.

---

## Common Commands Reference

```bash
# Start infrastructure
docker compose up -d

# Run API with hot reload
cd api && air

# Run web
cd apps/web && npm run dev

# Run mobile
cd apps/mobile && npx expo start

# Create new migration
migrate create -ext sql -dir api/migrations -seq name

# Install Go deps after go.mod changes
cd api && go mod tidy

# Pull and start (daily)
git pull origin main && docker compose up -d && cd api && air
```
