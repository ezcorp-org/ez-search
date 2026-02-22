---
phase: 08-project-scoped-storage
verified: 2026-02-23T16:55:14Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 8: Project-Scoped Storage Verification Report

**Phase Goal:** Index data stored at `<project>/.ez-search/` instead of `~/.ez-search/<hash>/`; shared models remain at `~/.ez-search/models/`
**Verified:** 2026-02-23T16:55:14Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                          | Status     | Evidence                                                                                                                      |
|----|----------------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------------------------|
| 1  | Index data (col-768, col-512, schema-version.json, manifest.json) lives at `<project>/.ez-search/`            | VERIFIED   | `openProjectCollections` uses `resolveProjectStoragePath(projectDir)` → `path.join(path.resolve(projectDir), '.ez-search')`  |
| 2  | Manifest lives at `<project>/.ez-search/manifest.json` instead of `<project>/.ez-search-cache`               | VERIFIED   | `MANIFEST_FILENAME = 'manifest.json'`; `manifestPath()` = `resolveProjectStoragePath(dir) + 'manifest.json'`                 |
| 3  | Shared model weights remain at `~/.ez-search/models/` (unchanged)                                             | VERIFIED   | `resolveModelCachePath()` returns `path.join(os.homedir(), '.ez-search', 'models')` — no change                              |
| 4  | `ez-search index .` creates `.ez-search/` directory inside the project                                        | VERIFIED   | `openProjectCollections` calls `mkdirSync(storageDir, { recursive: true })`; `saveManifest` also calls `mkdirSync` as guard  |
| 5  | `ez-search index --clear .` removes `.ez-search/` directory and recreates it                                  | VERIFIED   | `--clear` block does `rmSync(storagePath, { recursive: true, force: true })` then `openProjectCollections(absPath)` — atomic |
| 6  | `ez-search status` shows the new storage path                                                                  | VERIFIED   | status-cmd line 107: `manifestPath = path.join(resolveProjectStoragePath(projectDir), MANIFEST_FILENAME)`; line 168: `storagePath = resolveProjectStoragePath(projectDir)`; output includes `storagePath` (JSON) and `Index: ${storagePath}` (text) |
| 7  | `ez-search query` still loads manifest from the correct location                                               | VERIFIED   | query-cmd calls `loadManifest(projectDir)`; `loadManifest` internally calls `manifestPath(projectDir)` which uses `resolveProjectStoragePath` |
| 8  | `.ez-search/` is in `BUILTIN_EXCLUSIONS` so the scanner never indexes its own data                            | VERIFIED   | `src/types.ts` line 84: `'.ez-search'` present in `BUILTIN_EXCLUSIONS`; `file-scanner.ts` applies the list via `ig.add(BUILTIN_EXCLUSIONS)` |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                               | Expected                                                          | Status     | Details                                                                                  |
|----------------------------------------|-------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------|
| `src/config/paths.ts`                  | `resolveProjectStoragePath` returns `<projectDir>/.ez-search`    | VERIFIED   | 19 lines; exports function; returns `path.join(path.resolve(projectDir), '.ez-search')` |
| `src/services/manifest-cache.ts`       | Manifest at `.ez-search/manifest.json` via `resolveProjectStoragePath` | VERIFIED | 133 lines; `MANIFEST_FILENAME = 'manifest.json'`; `manifestPath()` helper DRYs path construction; imports `resolveProjectStoragePath` |
| `src/cli/commands/index-cmd.ts`        | `--clear` uses `rmSync(storagePath)` only, no redundant `clearManifest` | VERIFIED | 563 lines; `--clear` block: `rmSync(storagePath, { recursive: true, force: true })` + reopen; no `clearManifest` call in that block |
| `src/cli/commands/status-cmd.ts`       | `manifestPath` uses `resolveProjectStoragePath + MANIFEST_FILENAME` | VERIFIED | 221 lines; line 107 constructs path correctly; `resolveProjectStoragePath` imported once and reused for both manifest check (line 107) and storage check (line 168) |
| `src/services/vector-db.ts`            | Storage layout comments reference `<project>/.ez-search/`        | VERIFIED   | 228 lines; module JSDoc and `openProjectCollections` JSDoc both reference `<projectDir>/.ez-search/`; imports and calls `resolveProjectStoragePath` |

### Key Link Verification

| From                             | To                        | Via                                   | Status  | Details                                                                                |
|----------------------------------|---------------------------|---------------------------------------|---------|----------------------------------------------------------------------------------------|
| `src/services/manifest-cache.ts` | `src/config/paths.ts`     | `import resolveProjectStoragePath`    | WIRED   | Static import line 15; used in `manifestPath()` (line 47) and `saveManifest()` (line 80) |
| `src/services/vector-db.ts`      | `src/config/paths.ts`     | `import resolveProjectStoragePath`    | WIRED   | Static import line 15; used in `openProjectCollections()` (line 219)                   |
| `src/cli/commands/status-cmd.ts` | `src/config/paths.ts`     | Dynamic import `resolveProjectStoragePath` | WIRED | Dynamic import line 105; used at lines 107 and 168 (deduped)                           |
| `src/cli/commands/query-cmd.ts`  | `src/services/manifest-cache.ts` | `loadManifest(projectDir)`      | WIRED   | Dynamic import line 39; `loadManifest(projectDir)` called line 40; manifest path resolved internally via `resolveProjectStoragePath` |

### Requirements Coverage

All phase requirements satisfied:

| Requirement                                                              | Status    | Evidence                                                      |
|--------------------------------------------------------------------------|-----------|---------------------------------------------------------------|
| `resolveProjectStoragePath` returns `<projectDir>/.ez-search` (no hash) | SATISFIED | `path.join(path.resolve(projectDir), '.ez-search')` — no crypto, no homedir |
| No references to old `~/.ez-search/<basename>-<hash>/` pattern           | SATISFIED | Zero matches for `ez-search-cache`, `basename.*hash`, `createHash.*path` in `src/` |
| `resolveModelCachePath()` unchanged at `~/.ez-search/models/`            | SATISFIED | Returns `path.join(os.homedir(), '.ez-search', 'models')`    |
| `.ez-search` in `BUILTIN_EXCLUSIONS`                                     | SATISFIED | `src/types.ts` line 84                                        |

### Anti-Patterns Found

No blockers or warnings found.

| File | Pattern | Severity | Verdict  |
|------|---------|----------|----------|
| All modified files | No TODO/FIXME/placeholder/stub patterns | — | Clean    |
| `src/config/paths.ts` | No `crypto` import (removed per plan) | — | Correct  |
| `src/cli/commands/index-cmd.ts` | No `clearManifest` call in `--clear` block | — | Correct  |

### Human Verification Required

None required. All critical behaviors are fully verifiable statically:
- Path construction logic is a single `path.join` expression, no runtime branching.
- `BUILTIN_EXCLUSIONS` inclusion of `.ez-search` is a literal array entry.
- `--clear` block is a straightforward `rmSync` + reopen with no conditional logic.

The SUMMARY mentions an E2E smoke test was run (`index .` creates `.ez-search/` with all subdirs; `query` reads from it). This cannot be re-run as part of static verification, but all code paths that would produce that result are fully wired.

### Gaps Summary

No gaps. All 8 must-have truths are verified against the actual code. The goal is achieved.

---

_Verified: 2026-02-23T16:55:14Z_
_Verifier: Claude (gsd-verifier)_
