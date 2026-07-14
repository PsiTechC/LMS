---
name: Debug Issue
description: Systematically debug issues using graph-powered code navigation
---

## Debug Issue

Use the knowledge graph to systematically trace and debug issues, if the
`code-review-graph` MCP tools are available in this session (check the tool
list first). **If they are not available**, fall back to Grep/Glob/Read:
grep for the symptom or symbol, read the relevant files, and trace callers
manually — do not block on the graph or ask the user to install it.

### Steps (with graph tools)

1. Use `semantic_search_nodes` to find code related to the issue.
2. Use `query_graph` with `callers_of` and `callees_of` to trace call chains.
3. Use `get_flow` to see full execution paths through suspected areas.
4. Run `detect_changes` to check if recent changes caused the issue.
5. Use `get_impact_radius` on suspected files to see what else is affected.

### Tips

- Check both callers and callees to understand the full context.
- Look at affected flows to find the entry point that triggers the bug.
- Recent changes are the most common source of new issues.

## Token Efficiency Rules (graph tools only)
- ALWAYS start with `get_minimal_context(task="<your task>")` before any other graph tool.
- Use `detail_level="minimal"` on all calls. Only escalate to "standard" when minimal is insufficient.
- Target: complete any review/debug/refactor task in ≤5 tool calls and ≤800 total output tokens.
