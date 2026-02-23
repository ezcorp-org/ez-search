# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Developers can semantically search their codebase locally with zero cloud dependencies -- fast enough to be useful as a retrieval engine for AI assistants.
**Current focus:** Phase 3: Code Indexing Pipeline (In progress)

## Current Position

Phase: 3 of 6 (Code Indexing Pipeline)
Plan: 1 of N in current phase (03-01 complete)
Status: In progress — 03-01 complete (manifest cache + foundation updates)
Last activity: 2026-02-23 -- Completed 03-01-PLAN.md (manifest cache service)

Progress: [█████░░░░░] 40%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 16 min
- Total execution time: 1.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-validation-spike | 2/2 | 62 min | 31 min |
| 02-foundation-and-infrastructure | 3/3 | 29 min | ~10 min |
| 03-code-indexing-pipeline | 2/N | ~1 min | <1 min |

**Recent Trend:**
- Last 5 plans: 40 min, 2 min, 2 min, 25 min, <1 min
- Trend: fast (service implementation tasks)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **Zvec viability CONFIRMED** -- @zvec/zvec v0.2.0 passes all CRUD operations at 768-dim/1000-docs on NixOS. Proceed with Zvec as vector DB in Phase 2+.
- **ID format constraint** -- Zvec rejects IDs containing colons. Use underscores/hyphens only (e.g., `doc_123`, `chunk_abc-456`).
- **COSINE distance semantics** -- Zvec COSINE metric returns distance (0=exact match), not similarity. Sort ascending for ranking.
- **optimizeSync is required** -- Call after bulk inserts for 10x query speedup (4ms -> 0.4ms observed).
- **ESM/CJS interop** -- Use `createRequire(import.meta.url)` to import @zvec/zvec in ESM projects.
- **Transformers.js CPU fallback confirmed** -- WebGPU fails on NixOS without vulkan-loader; CPU q8 fallback works automatically, <100ms inference.
- **WebGPU NixOS requirement** -- Requires vulkan-loader in LD_LIBRARY_PATH (pkgs.vulkan-loader in shell.nix).
- **Model selection confirmed** -- jinaai/jina-embeddings-v2-base-code (code, 768-dim) and nomic-ai/nomic-embed-text-v1.5 (text, 768-dim, task prefixes required).
- **device: 'cpu' not 'wasm'** -- For Node.js Transformers.js fallback; 'wasm' is browser-only.
- **Official model IDs only** -- Xenova/ mirrors return 401; use jinaai/ and nomic-ai/ directly.
- **Dynamic import() for lazy loading** -- All CLI command handlers use `await import('./commands/xxx.js')` to defer heavy module loading. Compiled --help runs in 22ms.
- **crypto.createHash not crypto.hash** -- Use `crypto.createHash('sha256')` (Node 20+) not `crypto.hash()` (Node 21.7+ only) for compatibility with engines>=20.
- **tsconfig rootDir = src** -- Changed from `.` to `src` to prevent spike/ files from appearing in dist/ output.
- **Commander --no-ignore convention** -- `--no-ignore` flag yields `options.ignore = false` (boolean); true = use ignore files, false = disabled. Wiring to scanFiles deferred to Phase 3.
- **Scanner gitignore dir semantics** -- Check both `relPath+'/'` and `relPath` for directories; both patterns (`dist` and `dist/`) must be respected.
- **Scanner always excludes built-ins** -- Built-in exclusions active even when `useIgnoreFiles: false`; only `.gitignore`/`.cursorignore` are disabled.
- **Scanner skips symlinks** -- No explicit cycle detection needed; symlinks are skipped entirely.
- **VectorCollection close() is a no-op** -- Zvec handles GC-cleaned; use destroySync() only to delete from disk.
- **embed() uses Promise.all** -- Batch parallelism on CPU via Promise.all; ONNX handles internal concurrency.
- **tsx CJS conflict in /tmp** -- Files in /tmp without package.json treated as CJS by tsx, rejecting top-level await. Use async main() wrapper or .mts extension.
- **Tokenizer singleton pattern** -- Load AutoTokenizer once via loadTokenizer(), pass to all chunkFile() calls. Loading per-file costs ~1s each.
- **encode() returns array-like not plain Array** -- Jina tokenizer encode() has .length but Array.isArray() returns false. Use Array.from() for slice(), or cast `(ids as unknown as { length: number }).length` for counting.
- **Manifest version mismatch → empty manifest** -- No migration; simpler to re-index than handle partial compatibility.
- **makeChunkId format** -- `<12-char sha256-path-hash>_<4-digit-index>`, no colons (Zvec constraint).
- **Vector DB schema v2** -- chunkText STRING field added; ensureSchemaVersion() auto-wipes col-768/col-512 on mismatch.

### Pending Todos

None yet.

### Blockers/Concerns

- Zvec concern RESOLVED: bindings confirmed working on NixOS
- WebGPU concern RESOLVED: CPU fallback confirmed working; WebGPU needs vulkan-loader config in Phase 2+

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 03-01-PLAN.md — manifest cache service and Phase 3 foundation updates.
Resume file: None
