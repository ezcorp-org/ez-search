# Phase 6: Status and Polish - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Status command showing index state (file count, last indexed timestamp, active model types, index size on disk). Error handling polish across all commands for common failures (no index found, empty directory, unsupported file type). This is a CLI built primarily for AI agent consumption (agentic CLI).

</domain>

<decisions>
## Implementation Decisions

### Status output design
- JSON output by default (agents are primary consumers)
- `--format text` for human-readable table (same flag pattern as index/query commands)
- Fields: fileCount, chunkCount, lastIndexed (ISO 8601), modelTypes (array of active types), indexSizeBytes, storagePath
- Break down counts per model type: `{ code: { files: N, chunks: N }, text: { files: N, chunks: N }, image: { files: N, chunks: N } }`
- Include index staleness indicator: number of files changed since last index (via manifest mtime comparison)
- Exit code 0 on success, non-zero if no index exists

### Error messaging strategy
- Structured JSON errors: `{ "error": true, "code": "NO_INDEX", "message": "...", "suggestion": "..." }`
- Error codes are stable strings agents can match on (e.g., NO_INDEX, EMPTY_DIR, UNSUPPORTED_TYPE, CORRUPT_MANIFEST)
- Every error includes a `suggestion` field with the exact command to fix it (e.g., `"suggestion": "Run: ez-search index ."`)
- Text format errors: single-line `Error: [message]. Try: [suggestion]`
- Exit codes: 0 = success, 1 = general error, 2 = no index found

### Edge case behavior
- No index found: structured error with code NO_INDEX, suggestion to run index
- Empty directory (no indexable files): structured error with code EMPTY_DIR
- Partial/corrupted manifest: report what's readable, warn about corruption, suggest `--clear` re-index
- Missing vector collections but manifest exists: report inconsistency, suggest `--clear` re-index
- Never prompt interactively — fail with clear error and exit code
- Never hang — all operations have implicit timeouts via the existing patterns

### Claude's Discretion
- Exact error code taxonomy (beyond the ones specified above)
- Whether to add `--verbose` flag to status for additional debug info
- How to calculate index size on disk (recursive directory size vs manifest tracking)
- Text format layout and column alignment

</decisions>

<specifics>
## Specific Ideas

- Primary consumers are AI coding agents (Claude Code, Cursor, etc.) — JSON-first design
- Agents need to quickly determine: "is this project indexed?" and "is the index stale?"
- Error suggestions should be copy-pasteable commands, not prose
- Follow the existing `--format text|json` pattern already used by index and query commands

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-status-and-polish*
*Context gathered: 2026-02-23*
