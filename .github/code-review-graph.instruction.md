---
applyTo: '**'
description: >-
  If code-review-graph MCP tools are available in this session,
  prefer them for token-efficient codebase exploration and review.
---

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph (optional, per-developer)

This is an opt-in local tool, configured per-machine — it will not be
available in every session. **If the code-review-graph MCP tools are
registered, prefer them over file/search tools** to explore the
codebase; they're faster, cheaper (fewer tokens), and give structural
context (callers, dependents, test coverage) that file scanning
cannot. **If they are not registered, use normal file/search tools**
without comment.

### When to use graph tools FIRST (if available)

- **Exploring code**: `semantic_search_nodes` or `query_graph`
- **Understanding impact**: `get_impact_radius`
- **Code review**: `detect_changes` + `get_review_context`
- **Finding relationships**: `query_graph` callers_of/callees_of
- **Architecture questions**: `get_architecture_overview`

Fall back to file/search tools whenever the graph tools aren't available, or when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Risk-scored change analysis |
| `get_review_context` | Token-efficient source snippets |
| `get_impact_radius` | Blast radius of a change |
| `get_affected_flows` | Impacted execution paths |
| `query_graph` | Trace callers, callees, imports, tests |
| `semantic_search_nodes` | Find functions/classes by keyword |
| `get_architecture_overview` | High-level structure |
| `refactor_tool` | Rename planning, dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
