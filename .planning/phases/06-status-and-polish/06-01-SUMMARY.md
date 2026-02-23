---
phase: 06-status-and-polish
plan: 01
subsystem: cli
tags: [cli, status, error-handling, structured-errors, json-output]

# Dependency graph
requires:
  - phase: 05-multi-model-routing
    provides: manifest-based type auto-detection, col-768 multi-type routing
  - phase: 03-code-indexing-pipeline
    provides: manifest-cache, file-scanner, resolveProjectStoragePath
provides:
  - Shared emitError() utility with ErrorCode and StructuredError types
  - Full status command with JSON and text output modes
  - Normalized structured error output across all three CLI commands
affects: [future CLI commands, AI agent integrations, CI/CD pipelines parsing ez-search output]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared CLI error utility: emitError() returns never, calls process.exit(), JSON to stdout / text to stderr"
    - "Status command: existsSync manifest check before loadManifest to avoid silent empty-manifest return"
    - "Staleness detection: scan current files, diff against manifest mtimes, count deleted manifest entries"

key-files:
  created:
    - src/cli/errors.ts
    - src/cli/commands/status-cmd.ts (replaced stub)
  modified:
    - src/cli/index.ts
    - src/cli/commands/index-cmd.ts
    - src/cli/commands/query-cmd.ts

key-decisions:
  - "JSON errors to stdout, text errors to stderr — same channel as normal JSON output for agent parsing"
  - "emitError returns never — TypeScript infers unreachable code after call, no explicit return needed"
  - "existsSync(manifestPath) before loadManifest() — loadManifest() silently returns empty for missing files"
  - "storagePath missing with valid manifest => CORRUPT_MANIFEST error (not NO_INDEX)"

patterns-established:
  - "StructuredError shape: { error: true, code: ErrorCode, message: string, suggestion: string }"
  - "Exit codes: 0 success, 1 general/corrupt error, 2 no index"
  - "byType always has all three keys (code/text/image) even at zero — predictable agent parsing"

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 6 Plan 1: Status Command and Normalized Error Handling Summary

**`ez-search status` JSON command with fileCount/chunkCount/staleFileCount/byType breakdown, plus shared emitError() used by all three CLI commands for agent-parseable {error,code,message,suggestion} output**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-23T15:32:13Z
- **Completed:** 2026-02-23T15:33:53Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Full `ez-search status` command replaces stub — outputs fileCount, chunkCount, lastIndexed, modelTypes, indexSizeBytes, storagePath, staleFileCount, byType
- `--format text` produces compact human-readable status table
- `--no-ignore` option wired to staleness scan
- Shared `emitError()` utility in `src/cli/errors.ts` — single source of truth for structured error output
- All three CLI commands (index, query, status) emit `{error:true, code, message, suggestion}` on failure

## Task Commits

Each task was committed atomically:

1. **Task 1: Status command and shared error utility** - `c64e26c` (feat)
2. **Task 2: Normalize error handling in index and query commands** - `31a1534` (feat)

**Plan metadata:** (see final commit hash below)

## Files Created/Modified
- `src/cli/errors.ts` - Shared emitError() utility with ErrorCode type and StructuredError interface
- `src/cli/commands/status-cmd.ts` - Full status command (replaced stub) with JSON/text output, staleness detection, size calculation
- `src/cli/index.ts` - Status command wired with --format and --no-ignore options
- `src/cli/commands/index-cmd.ts` - Catch block migrated to emitError() with GENERAL_ERROR
- `src/cli/commands/query-cmd.ts` - Outer catch and image-type handler migrated to emitError()

## Decisions Made
- JSON errors go to stdout (not stderr) so agent pipelines reading stdout get errors on the same channel as success output
- `emitError()` return type is `never` — TypeScript infers unreachable code after the call, eliminating dead `return` statements
- Used `existsSync(manifestPath)` before calling `loadManifest()` because `loadManifest()` silently returns an empty manifest for missing files (by design for the index pipeline), which would give misleading status output
- Storage path missing with manifest present => CORRUPT_MANIFEST (not NO_INDEX) because manifest proves indexing happened

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `ez-search status` is fully operational for both human and agent consumers
- All three commands now emit parseable structured errors — agents can match on `error: true` and `code` fields
- Phase 06 plan 01 complete; ready for any remaining polish plans
---
*Phase: 06-status-and-polish*
*Completed: 2026-02-23*
