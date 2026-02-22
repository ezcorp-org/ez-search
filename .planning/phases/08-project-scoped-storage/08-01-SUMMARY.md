---
phase: 08-project-scoped-storage
plan: 01
subsystem: storage
tags: [paths, manifest, vector-db, project-scoped]

# Dependency graph
requires:
  - phase: 07-gap-closure
    provides: hardened query/manifest pipeline with clean dead-code removal
provides:
  - resolveProjectStoragePath returns <projectDir>/.ez-search (no hash, no homedir)
  - Manifest stored at <projectDir>/.ez-search/manifest.json
  - All index data (col-768, col-512, schema-version.json, manifest.json) colocated in .ez-search/
  - --clear flag simplifies correctly (rmSync removes entire .ez-search/)
  - status command manifest path uses resolveProjectStoragePath + MANIFEST_FILENAME
affects: [future-cli-enhancements, documentation, packaging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Project-scoped storage: index data lives inside the project dir, not ~/.ez-search"
    - "manifestPath() private helper centralizes path construction in manifest-cache.ts"
    - "Dynamic import deduplication: status-cmd imports resolveProjectStoragePath once, reuses for both manifest and storage path checks"

key-files:
  created: []
  modified:
    - src/config/paths.ts
    - src/services/manifest-cache.ts
    - src/cli/commands/index-cmd.ts
    - src/cli/commands/status-cmd.ts
    - src/services/vector-db.ts

key-decisions:
  - "Project-scoped storage path: <projectDir>/.ez-search (no basename-hash, no homedir)"
  - "Manifest filename changed to manifest.json (was .ez-search-cache)"
  - "manifestPath() private helper DRYs path construction inside manifest-cache.ts"
  - "clearManifest() call removed from --clear block: rmSync(.ez-search/) handles everything"
  - "resolveProjectStoragePath deduplication in status-cmd: moved to manifest check section, reused for storage existence check"

patterns-established:
  - "manifestPath(dir) = resolveProjectStoragePath(dir) + MANIFEST_FILENAME (always use this pattern)"
  - "saveManifest() ensures .ez-search/ dir exists via mkdirSync(recursive: true) before write"
  - "vector-db.ts already calls mkdirSync on storageDir; manifest-cache.ts also guards independently"

# Metrics
duration: 6min
completed: 2026-02-23
---

# Phase 8 Plan 01: Project-Scoped Storage Summary

**Moved index storage from `~/.ez-search/<project>-<hash>/` into `<project>/.ez-search/` and manifest from `<project>/.ez-search-cache` to `<project>/.ez-search/manifest.json`**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-23T11:46:30Z
- **Completed:** 2026-02-23T11:52:14Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Index data now lives at `<project>/.ez-search/` — delete project, delete index
- Manifest renamed from `.ez-search-cache` (hidden dot-file in project root) to `manifest.json` inside `.ez-search/` alongside vectors
- `resolveProjectStoragePath` simplified from a hash-based function to a single `path.join` — no crypto, no homedir lookup
- `--clear` flag simplified: `rmSync(.ez-search/, recursive)` handles everything atomically; redundant `clearManifest()` call removed
- E2E verified: `index .` creates `.ez-search/` with `col-768/`, `col-512/`, `manifest.json`, `schema-version.json`; `query` reads from it correctly

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor core path and manifest modules** - `7843dd5` (feat)
2. **Task 2: Update consumer modules and comments** - `dfa3a7e` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `src/config/paths.ts` - resolveProjectStoragePath now returns `<projectDir>/.ez-search`; crypto import removed
- `src/services/manifest-cache.ts` - MANIFEST_FILENAME = `manifest.json`; manifestPath() helper; saveManifest creates dir; imports resolveProjectStoragePath
- `src/cli/commands/index-cmd.ts` - Removed redundant clearManifest call from --clear block
- `src/cli/commands/status-cmd.ts` - manifestPath now uses resolveProjectStoragePath + MANIFEST_FILENAME; deduplicated import
- `src/services/vector-db.ts` - JSDoc updated to reflect new <project>/.ez-search/ layout

## Decisions Made
- **Project-scoped path format:** `<projectDir>/.ez-search` (no hash, no homedir). Consistent with `.git/`, `.next/`. Delete project = delete index.
- **MANIFEST_FILENAME = `manifest.json`**: Descriptive, nestled inside `.ez-search/` — not a hidden dot-file floating in project root.
- **manifestPath() private helper**: DRY — all three manifest functions (load/save/clear) call it. Single definition.
- **clearManifest removed from --clear**: After the refactor, `storagePath` IS `.ez-search/` which contains `manifest.json`, so `rmSync(storagePath)` is already complete. The separate `clearManifest()` was dead code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Duplicate `resolveProjectStoragePath` import in status-cmd.ts**
- **Found during:** Task 2 (status-cmd update)
- **Issue:** status-cmd.ts already imported `resolveProjectStoragePath` at line 168. Adding a second import at line 105 caused TS2451 redeclaration error.
- **Fix:** Moved the single import to the manifest-check section (line 105) and removed the now-redundant second import from the storage-check section (line 168). The variable is reused for both checks.
- **Files modified:** src/cli/commands/status-cmd.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** dfa3a7e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for compilation. No scope creep — the fix actually improved the code (deduplicated import).

## Issues Encountered
None — plan executed cleanly aside from the blocking import deduplication above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All index data is now project-scoped and self-contained
- `.ez-search/` already listed in BUILTIN_EXCLUSIONS so the scanner never indexes its own data
- Ready for further CLI enhancements, packaging, or documentation
- Old indexes in `~/.ez-search/<project>-<hash>/` will be abandoned (users can delete manually)

---
*Phase: 08-project-scoped-storage*
*Completed: 2026-02-23*
