---
name: Refactor Safely
description: Plan and execute safe refactoring using dependency analysis
---

## Refactor Safely

Use the knowledge graph to plan and execute refactoring with confidence, if
the code-review-graph MCP tools are available in this session (check the tool
list first). **If they are not available**, fall back to Grep for finding
references/call sites and Edit for renames — verify manually with grep after
each rename that no reference was missed. Do not block on the graph or ask
the user to install it.

### Steps (with graph tools)

1. Use `refactor_tool` with mode="suggest" for community-driven refactoring suggestions.
2. Use `refactor_tool` with mode="dead_code" to find unreferenced code.
3. For renames, use `refactor_tool` with mode="rename" to preview all affected locations.
4. Use `apply_refactor_tool` with the refactor_id to apply renames.
5. After changes, run `detect_changes` to verify the refactoring impact.

### Safety Checks

- Always preview before applying (rename mode gives you an edit list).
- Check `get_impact_radius` before major refactors.
- Use `get_affected_flows` to ensure no critical paths are broken.
- Run `find_large_functions` to identify decomposition targets.

## Token Efficiency Rules (graph tools only)
- ALWAYS start with `get_minimal_context(task="<your task>")` before any other graph tool.
- Use `detail_level="minimal"` on all calls. Only escalate to "standard" when minimal is insufficient.
- Target: complete any review/debug/refactor task in ≤5 tool calls and ≤800 total output tokens.
