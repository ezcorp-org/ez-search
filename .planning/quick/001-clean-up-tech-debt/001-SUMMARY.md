---
phase: quick
plan: 001
subsystem: cli-and-services
tags: [tech-debt, dead-code, bug-fix, query]
requires: []
provides:
  - "Clean manifest-cache module (no dead exports)"
  - "Robust NO_INDEX guard covering --type flag"
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - src/services/manifest-cache.ts
    - src/cli/commands/query-cmd.ts
    - tests/unit/manifest-cache.test.ts
decisions:
  - id: "quick-001-1"
    title: "Remove clearManifest entirely"
    choice: "Delete function, import, and tests"
    reason: "--clear path uses rmSync on entire .ez-search/ directory; clearManifest was dead code"
metrics:
  duration: "~2 min"
  completed: "2026-02-23"
---

# Quick Plan 001: Clean Up Tech Debt Summary

**One-liner:** Removed dead clearManifest export and fixed query --type bypassing NO_INDEX guard on unindexed projects.

## What Was Done

### Task 1: Remove dead clearManifest export
- Deleted `clearManifest()` function and its JSDoc from `manifest-cache.ts`
- Removed unused `unlinkSync` import
- Removed `clearManifest` tests from `manifest-cache.test.ts`
- Commit: `85d23ff`

### Task 2: Fix query --type NO_INDEX guard
- Added `totalIndexed === 0` guard before type-determination block
- This guard fires regardless of `--type` flag, preventing silent 0 results on unindexed projects
- Simplified existing `typesToQuery.length === 0` guard by removing redundant `&& !options.type` condition
- Commit: `5aa8fe7`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test file imported clearManifest**
- **Found during:** Task 1
- **Issue:** `tests/unit/manifest-cache.test.ts` imported and tested `clearManifest`, causing test suite failure after removal
- **Fix:** Removed the import and `describe('clearManifest', ...)` test block
- **Files modified:** `tests/unit/manifest-cache.test.ts`
- **Commit:** `85d23ff`

## Verification

- `grep -r "clearManifest" src/` returns no matches
- `bun build src/services/manifest-cache.ts --no-bundle` succeeds
- `bun build src/cli/commands/query-cmd.ts --no-bundle` succeeds
- `bun test` passes 92/92 tests across 10 files
