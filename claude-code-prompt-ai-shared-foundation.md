# Claude Code Prompt — AI Shared Module Foundation (Phase 0)

Paste everything below into Claude Code, run from the repo root
(`c:\Users\Tejas-Psitech\Desktop\Psitech\LMS\api`).

---

## Context

We're building a shared AI engine layer for an LMS backend (Go, Postgres +
pgvector, Docker). AI features span 6 roles/personas (Participant, Coach,
Faculty, Program Manager/HR, Super Admin — plus two permission-scoped
variants, Participant Retail and Superadmin Secondary) but they reduce to
**6 reusable engines** shown below. We are NOT building one AI feature per
endpoint — every persona-facing feature is a thin, scope-restricted call
into one of these shared engines.

There is already a working `internal/ai` package (a `ChatJSON`/`ChatStream`
completion layer, plus dto/extract/handler/service/model/repository files
of unconfirmed purpose) and an `internal/shared` package with RBAC. This
phase is a **deliberate redesign** of the AI layer into the shared-engine
architecture below, not a preserve-everything extension. Internal
structure, function signatures, and file locations are all open to change
— including moving/renaming/rewriting `chat.go` and `provider.go` — where
the new design calls for it. The one constraint: whatever `handler.go`
currently exposes over HTTP to the frontend should keep working
(same request/response shape) unless a specific reason to change it is
flagged in the Step 2 plan. Internal refactor freedom does not mean
breaking the frontend contract silently.

### Existing files (read these first, do not modify yet)

`chat.go` and `provider.go` have already been reviewed — treat the notes
below as ground truth, not assumptions to re-derive:

```
internal/ai/
  chat.go        — ChatJSON(): single non-streaming completion call that
                   forces JSON-object output. Transport-layer only — no
                   conversation/tool-calling logic here.
  dto.go
  extract.go     — name suggests structured-output parsing from ChatJSON's
                   JSON-object responses. Possibly where "DB tools" actually
                   live: model returns JSON describing an action, Go parses
                   and executes it, rather than native function-calling.
                   CONFIRM, don't assume.
  handler.go
  init.go
  model.go
  provider.go    — providerConfig() reads AI_BASE_URL/AI_API_KEY/AI_MODEL
                   from env. ChatStream() does streaming completions. Its
                   own comment states this already works with OpenAI, Azure
                   OpenAI, or local Ollama via env change only — no code
                   change to switch. Good baseline behavior to preserve
                   (the env-driven wire-compatibility), but the code
                   structure itself (single global config, no tiering, no
                   embeddings, package-level not subpackage) is open to
                   redesign — see requirement 2 below.
  repository.go
  service.go     — likely holds the actual chatbot/conversation/tool-calling
                   logic referenced above, if it exists. CONFIRM.

internal/shared/
  middleware.go
  rbac.go            — role/permission model
  rbac_hybrid.go
  rbac_shadow.go
  response.go
```

### Target shared engines

| Engine (package) | Category | Used by (persona : feature) |
|---|---|---|
| `rag` | RAG | Participant: AI Learning Coach, AI Study Companion · Coach: Coach Assistant Chatbot |
| `riskscoring` | ML | Faculty: At-Risk Learner Alerts · PM: Dropout Prediction Model — same model, individual view vs. PM dashboard |
| `rubric` | RAG + NLP | Participant: Capstone Feedback Assistant · Faculty: Grading Assist |
| `aggregate` | Agentic | Faculty: Cohort Intelligence Brief · PM: Automated ROI Narrative, Cohort Health Score · Super Admin: Platform Optimization Advisor, Cross-Org Benchmark Reports |
| `recommend` | ML | Participant: Adaptive Learning Path · PM: Program Design Recommender |
| `notify` | Basic AI + Agentic | Participant: Goal Tracker & Nudge Engine, Reflection Prompt Engine · PM: Smart Notification Optimizer · This is also the shared alert-decision layer that `riskscoring` fires into |
| `classify` | NLP | PM: Survey Sentiment Analysis · Faculty: Content Quality Scorer · partial: 360° Narrative Summary |

Two features stay standalone, do not force them into the above:
Anomaly Detection Engine (Super Admin — different feature space, infra/security
signals not learner behavior) and Onboarding Automation (Super Admin —
workflow automation). Scaffold empty packages for these but no logic yet.

Session Transcript & Summary and Coaching Insight Engine are **dropped** —
do not build ASR/speech-to-text anywhere in this.

### Cross-cutting requirements every engine must follow

1. **Scope struct, not per-persona forks.** Every exported engine function
   takes a `Scope` (org_id, program_id, role, and any narrower restriction)
   built from `internal/shared/rbac.go`. Participant Retail and Superadmin
   Secondary must be implementable later as a *narrower Scope*, not a
   separate code path.
2. **Provider — redesign around explicit, resolvable config.** Move the
   provider layer into `internal/ai/provider` as its own package. Replace
   the pattern of each function reading global env vars directly with:
   a. A `Config` struct: `BaseURL, APIKey, Model string`.
   b. `Resolve(scope Scope, tier Tier) Config` — the single place that
      decides which config applies. For now it reads env vars (global
      default, plus optional `AI_MODEL_<TIER>` overrides per tier) and
      ignores `scope` for provider selection — but because `scope` is
      already a parameter, adding per-org provider overrides later (e.g.
      a specific client org pinned to Azure OpenAI for compliance) is a
      change inside `Resolve` only, not a new abstraction layer or a
      signature change on every call site.
   c. `Complete(ctx, cfg Config, msgs []ChatMessage) (string, error)` and
      `Stream(ctx, cfg Config, msgs []ChatMessage, onDelta func(string)) (string, error)`
      — same behavior as today's `ChatJSON`/`ChatStream`, just taking an
      explicit `Config` instead of reading env internally. Rename is fine.
   d. `Embed(ctx, cfg Config, texts []string) ([][]float32, error)` — new,
      same request/auth pattern as `Complete`, hitting `/embeddings`.
   No `LLMProvider` interface — every provider we're targeting (OpenAI,
   Azure OpenAI, Ollama) speaks the same OpenAI-compatible wire format, so
   polymorphism buys nothing over passing a different `Config` value. Only
   introduce an interface if Step 1 finds a provider on the roadmap with a
   genuinely different API shape (e.g. native Anthropic Messages API) —
   flag it in the Step 2 plan if so, don't build it speculatively.
3. **Every engine call passes a `Tier`** (e.g. `TierClassify`, `TierReason`,
   `TierDeepReason`, `TierEmbed`) into `provider.Resolve` — engines never
   pick a model name directly, so cheap-vs-expensive routing is a config
   change, not a code change.
4. **Prompt templates live in files/config**, not inline Go strings —
   versioned, editable without redeploy.
5. **`riskscoring` starts rule-based**, not ML-trained (no labeled data yet).
   Design the interface so a trained-model implementation can swap in later
   without changing callers (`Scorer` interface with a `RuleBasedScorer` now).
6. **`notify` implements the cooldown/debounce pattern**: don't re-fire an
   alert for the same subject within a configurable window; only fire on a
   state transition into an alert condition.
7. Reuse existing `internal/shared/middleware.go` and `response.go`
   conventions for any new HTTP handlers — don't invent a second style.

---

## Step 1 — Inspect only (no code changes yet)

Read every file in `internal/ai/` and `internal/shared/`. Summarize:
- Confirm what `service.go`/`handler.go`/`extract.go` actually do — is
  there real conversation/tool-calling logic there, and if so, is it native
  OpenAI function-calling or a JSON-object-mode-plus-manual-parsing pattern
  (i.e. `ChatJSON` + `extract.go`)? Report which, don't assume.
- Confirm `provider.go`/`chat.go` are the complete current provider layer
  (they are, per the review already done — just re-confirm nothing else
  duplicates this).
- What `rbac.go` / `rbac_hybrid.go` / `rbac_shadow.go` provide — is there
  already an org/program scoping concept we can reuse for `Scope`, or does
  it need extending?
- Any existing scheduled-job / cron infrastructure in the codebase (check
  outside these two folders too) that `riskscoring`'s nightly batch and
  `notify`'s cooldown checks could plug into, versus needing new scaffolding.

## Step 2 — Propose a plan, wait for approval

Before writing any code, give me:
- Proposed folder structure under `internal/ai/` for the 6 engines +
  `provider` (+ empty `anomaly` and `onboarding` scaffolds).
- What from the existing 9 files moves into `provider` vs. gets rewritten
  vs. gets removed entirely — be specific and explicit, this phase allows
  real structural change, not just additive extension.
- The `Scope` and `Config`/`Tier`/`Resolve` designs from requirements 1-3,
  mapped to what already exists in `rbac.go`.
- Confirm whether `handler.go`'s current external HTTP contract needs to
  change at all for this phase — if it does, flag why before touching it.

Stop and wait for my go-ahead on this plan before implementing.

## Step 3 — Implement (after plan approval)

- `internal/ai/provider`: new subpackage. Move and rewrite `chat.go`/
  `provider.go` into `Config`, `Resolve`, `Complete`, `Stream`, `Embed` per
  requirement 2. Update every call site in the rest of `internal/ai` to
  use the new package. This is a real move, not a copy — don't leave the
  old functions behind "just in case."
- `internal/ai/rag`: new package, built on `provider.Embed` (indexing/
  retrieval against pgvector) and `provider.Complete`/`Stream` (generation).
  If Step 1 found real conversation/tool-calling logic in `service.go`/
  `handler.go` worth preserving, absorb and rewrite it here against the
  new provider package rather than leaving it calling the old functions.
- `internal/ai/riskscoring`: `Scorer` interface, `RuleBasedScorer`,
  feature-aggregation query layer, nightly batch job entry point.
- `internal/ai/rubric`, `aggregate`, `recommend`, `notify`, `classify`:
  package + core interface + one minimal working method each, enough to
  prove the shape — full feature build-out happens role-by-role after this.
- `internal/ai/anomaly`, `internal/ai/onboarding`: empty packages with a
  `README.md` stub noting they're intentionally deferred.
- Update `CLAUDE.md`'s module status table to mark these as in progress
  with your name/date, per the existing convention.

## Step 4 — Verify

- Existing chatbot HTTP endpoint(s) still return the same response shape —
  no frontend-facing regression, even though the internals changed.
- Add basic unit tests for `provider.Complete`/`Stream`/`Embed` (mockable
  via `Config`, no real network call needed) and for `Scope`-based access
  restriction on at least one engine.
- Run whatever the existing test/build commands are for this repo and
  confirm green before handing back.

---

## Non-goals for this phase

- No Azure OpenAI deployment yet — `Resolve` supports it structurally,
  actually pointing at Azure is a config/env change for a later phase.
- No per-org provider override wiring — `Resolve` takes `Scope` now so
  this slots in later without a signature change, but the lookup itself
  isn't built this phase.
- No trained ML model — rule-based `riskscoring` only.
- No full feature build-out per role — that's the next phase, role by role.
- No ASR/speech-to-text.
