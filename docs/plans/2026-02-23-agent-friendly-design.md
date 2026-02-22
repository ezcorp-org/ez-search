# Agent-Friendly ez-search — Design Document

**Date:** 2026-02-23
**Phase:** A (Skill + CLI polish)
**Follow-up:** Phase B (MCP server) as future milestone

## Problem

AI agents (Claude Code, Cursor, Codex, etc.) can't easily use ez-search because:
1. **Discovery:** Agents don't know ez-search exists or how to use it optimally
2. **Ergonomics:** Querying requires a prior explicit `index` step; agents hit `NO_INDEX` errors and don't know what to do

## Goals

- Any shell-capable agent can use ez-search with a single command
- A skill file teaches agents when/how to use it effectively
- Zero new runtime dependencies
- Backward-compatible with existing CLI behavior

## Design

### 1. Auto-index on Query

**Current:** `ez-search query "find auth"` fails with `NO_INDEX` if not indexed.

**New:** When `query` detects no index, automatically index the project first.

- JSON output gains optional `indexing` field when auto-indexing occurs:
  ```json
  {
    "indexing": { "status": "ok", "filesIndexed": 42, "durationMs": 3200 },
    "query": "find auth",
    "code": [...],
    "text": [...]
  }
  ```
- `--no-auto-index` flag preserves current behavior (fail fast with `NO_INDEX`)
- `--quiet` suppresses indexing progress output during auto-index
- Indexing uses default options (respects .gitignore, all file types)

### 2. Stale Index Detection

On query, check manifest for files changed since last index:
- Include `stale: true` and `staleFileCount: N` in JSON output when detected
- Agents decide whether to re-index based on staleness
- No automatic re-indexing on stale (would be too slow/surprising)

### 3. CLI Ergonomics

- **Exit codes:** 0 for success (including empty results), 1 for errors only
- **`--help` examples:** Add JSON output examples to each subcommand help
- **No new commands** — keep command surface small; auto-index eliminates need for a `search` alias

### 4. Skill File

Shipped at `skills/ez-search.md` in the repo. Teaches agents:

- **When to use:** Semantic/meaning-based code search (vs. grep for exact matches)
- **How to use:** `ez-search query "description" --format json`
- **Optimal flags:** `--type code`, `--top-k 5`, `--threshold 0.5`, `--dir src/`
- **Result interpretation:** Score ranges, code vs text sections
- **When NOT to use:** Exact string matches, simple filename lookups

### Not in Phase A

- MCP server (Phase B)
- Programmatic TypeScript API
- `search` convenience command (unnecessary with auto-index)

## Success Criteria

1. `ez-search query "find auth" --format json` works on a never-indexed project (auto-indexes first)
2. Skill file can be installed and used by Claude Code
3. All existing tests continue to pass
4. New behavior is covered by tests
