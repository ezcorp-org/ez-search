---
phase: 02-foundation-and-infrastructure
verified: 2026-02-22T00:00:00Z
status: passed
score: 4/4 must-haves verified
gaps: []
# Gap resolved: ROADMAP and REQUIREMENTS updated to match home-directory design decision (user approved)
resolved_artifacts:
      - path: "src/config/paths.ts"
        issue: "resolveProjectStoragePath returns ~/.ez-search/<basename>-<hash>/ not .ez-search/ at project root"
      - path: "src/services/vector-db.ts"
        issue: "Correctly uses resolveProjectStoragePath; col-768 and col-512 collections are created with correct dimensions"
    missing:
      - "Clarify whether IDX-05 ('at index root') was intentionally superseded by the design decision in 02-CONTEXT.md (storage in ~/.ez-search/ home directory). If the ROADMAP criterion is still authoritative, the storage path implementation needs to change."
---

# Phase 2: Foundation and Infrastructure — Verification Report

**Phase Goal:** All infrastructure modules exist and are independently testable — the project skeleton is ready for pipeline integration
**Verified:** 2026-02-22
**Status:** gaps_found (1 gap — design decision conflict with ROADMAP success criterion)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `ez-search --help` completes in under 200ms | VERIFIED | Compiled binary: 23ms (0.023s total). Only `commander` imported at top level; all commands lazily loaded via dynamic `import()` in action handlers. |
| 2 | `.ez-search/` directory is created at index root with separate vector collections for 768-dim and 512-dim models | PARTIAL | Collections exist with correct dimensions (768/512) and are implemented. Location is `~/.ez-search/<project>-<hash>/` (home dir), not `.ez-search/` at the index root. Intentional design decision per 02-CONTEXT.md conflicts with ROADMAP success criterion wording. |
| 3 | File scanner respects .gitignore and .cursorignore rules, and `--no-ignore` flag disables exclusion | VERIFIED (structurally) | `scanFiles` loads both `.gitignore` and `.cursorignore` when `useIgnoreFiles: true`. Built-in exclusions (`BUILTIN_EXCLUSIONS`) always applied. `--no-ignore` flag in CLI correctly yields `options.ignore = false` via commander negation convention. Wiring of `options.ignore` to `scanFiles({ useIgnoreFiles })` is explicitly deferred to Phase 3 per plan. |
| 4 | Model router loads correct model on first use and falls back gracefully from WebGPU to WASM/CPU | VERIFIED (structurally) | `createEmbeddingPipeline` attempts WebGPU with `device: 'webgpu'` in a try/catch; catches any failure and falls back to CPU `device: 'cpu', dtype: 'q8'`. Backend logged to stderr. WebGPU→CPU fallback path is structurally sound. Runtime load cannot be verified without model cache. |

**Score:** 3/4 truths verified (1 partial — storage path location conflict)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types.ts` | FileType, ScannedFile, ScanOptions, ModelBackend, CollectionName, EXTENSION_MAP, BUILTIN_EXCLUSIONS | VERIFIED | 79 lines. All types exported. EXTENSION_MAP has code/text/image extensions. BUILTIN_EXCLUSIONS has 19 entries including `.ez-search`. No stub patterns. |
| `src/config/paths.ts` | resolveProjectStoragePath, resolveModelCachePath | VERIFIED | 23 lines. Both functions exported. Uses crypto.createHash('sha256') for 8-char hash. Substantive implementation. |
| `src/cli/index.ts` | Commander CLI with lazy-loaded subcommands | VERIFIED | 44 lines. Three subcommands (index, query, status) each using dynamic `import()` in action handlers. Only `commander` imported at top level. |
| `src/cli/commands/index-cmd.ts` | Index command with options | STUB (intentional) | 12 lines. Explicitly marked as stub, deferred to Phase 3. Correct function signature and option types present. |
| `src/cli/commands/query-cmd.ts` | Query command with options | STUB (intentional) | 10 lines. Explicitly marked as stub, deferred to Phase 3. Correct function signature present. |
| `src/cli/commands/status-cmd.ts` | Status command | STUB (intentional) | 7 lines. Explicitly marked as stub, deferred to Phase 3. |
| `src/services/file-scanner.ts` | scanFiles async generator with ignore filtering | VERIFIED | 86 lines. Full implementation: built-in exclusions always active, gitignore/cursorignore loaded conditionally, type classification via EXTENSION_MAP, typeFilter support, symlink skipping, async generator pattern. |
| `src/services/vector-db.ts` | Zvec wrapper with openProjectCollections | VERIFIED | 193 lines. Full implementation: CJS-in-ESM via createRequire, ZVecInitialize at module level, schema builder, collection wrapper with insert/query/remove/optimize/close, ID validation, correct field types. |
| `src/services/model-router.ts` | createEmbeddingPipeline with WebGPU fallback | VERIFIED | 152 lines. Full implementation: MODEL_REGISTRY with code/text models, WebGPU try/catch fallback, env.cacheDir set before pipeline(), embed() with Promise.all, dispose() guard. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/cli/index.ts` | `src/cli/commands/index-cmd.ts` | dynamic `import('./commands/index-cmd.js')` | WIRED | Dynamic import inside action handler — heavy modules not loaded at entry |
| `src/cli/index.ts` | `src/cli/commands/query-cmd.ts` | dynamic `import('./commands/query-cmd.js')` | WIRED | Same lazy pattern |
| `src/cli/index.ts` | `src/cli/commands/status-cmd.ts` | dynamic `import('./commands/status-cmd.js')` | WIRED | Same lazy pattern |
| `src/services/file-scanner.ts` | `src/types.ts` | `import { ScannedFile, ScanOptions, EXTENSION_MAP, BUILTIN_EXCLUSIONS }` | WIRED | All types consumed; EXTENSION_MAP drives classification; BUILTIN_EXCLUSIONS always loaded |
| `src/services/vector-db.ts` | `src/config/paths.ts` | `import { resolveProjectStoragePath }` | WIRED | resolveProjectStoragePath called in openProjectCollections |
| `src/services/model-router.ts` | `src/config/paths.ts` | `import { resolveModelCachePath }` | WIRED | resolveModelCachePath assigned to env.cacheDir before first pipeline() call |
| `src/services/model-router.ts` | `src/types.ts` | `import type { ModelBackend }` | WIRED | ModelBackend type used for backend field |
| `src/cli/commands/index-cmd.ts` | `src/services/file-scanner.ts` | Call to `scanFiles` | NOT WIRED (intentional) | Command is a stub. Wiring deferred to Phase 3. |
| `src/cli/commands/index-cmd.ts` | `src/services/vector-db.ts` | Call to `openProjectCollections` | NOT WIRED (intentional) | Command is a stub. Wiring deferred to Phase 3. |

### Requirements Coverage

| Requirement | Description | Status | Notes |
|-------------|-------------|--------|-------|
| IDX-05 | All index state stored in `.ez-search/` hidden directory at index root | PARTIAL | Implementation uses `~/.ez-search/<project>-<hash>/` (home dir). Design decision in 02-CONTEXT.md explicitly chose this approach. Conflict with requirement wording needs resolution. |
| IDX-08 | Separate vector collections per model type (768-dim for code/text, 512-dim for images) | VERIFIED | `openProjectCollections` creates `col-768` (768-dim, HNSW+COSINE) and `col-512` (512-dim, HNSW+COSINE). |
| INFRA-01 | WebGPU inference with graceful fallback to WASM/CPU | VERIFIED (structurally) | try/catch wraps WebGPU attempt; CPU q8 fallback on any error. Backend reported to stderr. |
| INFRA-02 | Lazy model loading — models loaded only after command is parsed (cold start <1.5s) | VERIFIED | Only `commander` at top level. All command logic behind dynamic `import()`. --help at 23ms. |
| INFRA-04 | Respect .gitignore and .cursorignore for file exclusion | VERIFIED (structurally) | Both files loaded when `useIgnoreFiles: true`. CLI-to-scanner wiring deferred to Phase 3. |
| INFRA-05 | User can disable ignore file exclusion with `--no-ignore` flag | VERIFIED (structurally) | `--no-ignore` declared in CLI; commander yields `options.ignore = false`. Passed to scanner deferred to Phase 3. |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/cli/commands/index-cmd.ts` | `console.log('index command stub', ...)` | INFO | Intentional stub, explicitly documented as Phase 3 work. Not a blocker. |
| `src/cli/commands/query-cmd.ts` | `console.log('query command stub', ...)` | INFO | Intentional stub, explicitly documented as Phase 3 work. Not a blocker. |
| `src/cli/commands/status-cmd.ts` | `console.log('status command stub')` | INFO | Intentional stub, explicitly documented as Phase 3 work. Not a blocker. |

No blocker anti-patterns found. The command stubs are intentional — they are correctly declared in the CLI with proper option types, with implementations deferred to Phase 3 per the PLAN files.

### Human Verification Required

#### 1. Storage Path Location — Design Decision vs ROADMAP Criterion

**Test:** Confirm whether IDX-05 ("at index root") was intentionally changed to home-directory storage.
**Expected:** Either (a) ROADMAP success criterion 2 should be updated to reflect `~/.ez-search/<project>-<hash>/`, or (b) paths.ts should be changed to create `.ez-search/` at the indexed project directory.
**Why human:** This is a product decision about where index data lives, not a code correctness issue. The 02-CONTEXT.md explicitly documents the decision to use home-directory storage for easier multi-directory support and to avoid polluting project directories. The REQUIREMENTS.md may need updating to match this intentional design change.

#### 2. Model Router Runtime — WebGPU Fallback Behavior

**Test:** Run `createEmbeddingPipeline('code')` on the target system and observe backend selection.
**Expected:** System logs either `[model-router] Using WebGPU for jinaai/...` or `[model-router] WebGPU unavailable: ... Falling back to CPU`. Model produces 768-dim Float32Array from `pipe.embed(['test text'])`.
**Why human:** Requires loading the Jina model from cache (~1.5GB). Cannot verify without running actual model inference. Phase 1 spike validated this works on the target system.

---

## Gaps Summary

One gap identified — a storage path location conflict:

The ROADMAP success criterion states `.ez-search/ directory is created at index root`. The actual implementation (and the explicit design decision recorded in `02-CONTEXT.md`) puts storage at `~/.ez-search/<project>-<hash>/` in the user's home directory. The two vector collections (col-768 at 768-dim, col-512 at 512-dim) are correctly implemented with the right schemas and wiring.

This is not a bug in the implementation — it is a design decision conflict that needs human resolution. The home-directory approach has clear advantages (avoids polluting project directories, easier for cross-directory tooling, models shared across projects) and was explicitly chosen during planning.

**Resolution options:**
1. Update ROADMAP success criterion 2 to read `~/.ez-search/<project>-<hash>/` — no code changes needed.
2. Change `resolveProjectStoragePath` to return `.ez-search/` relative to the project root — requires updating paths.ts and the path resolution design.

All three infrastructure modules (`file-scanner.ts`, `vector-db.ts`, `model-router.ts`) are substantive, fully implemented, and independently testable. The CLI skeleton is wired with lazy loading. TypeScript compiles clean with no errors. The phase goal of "all infrastructure modules exist and are independently testable — the project skeleton is ready for pipeline integration" is substantially achieved.

---

_Verified: 2026-02-22_
_Verifier: Claude (gsd-verifier)_
