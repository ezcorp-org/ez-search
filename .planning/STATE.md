# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Developers can semantically search their codebase locally with zero cloud dependencies -- fast enough to be useful as a retrieval engine for AI assistants.
**Current focus:** Phase 1: Validation Spike (COMPLETE)

## Current Position

Phase: 1 of 6 (Validation Spike)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-02-23 -- Completed 01-02-PLAN.md (Transformers.js inference spike)

Progress: [██░░░░░░░░] 17%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 31 min
- Total execution time: 1.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-validation-spike | 2/2 | 62 min | 31 min |

**Recent Trend:**
- Last 5 plans: 22 min, 40 min
- Trend: +18 min (model downloads on first run)

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

### Pending Todos

None yet.

### Blockers/Concerns

- Zvec concern RESOLVED: bindings confirmed working on NixOS
- WebGPU concern RESOLVED: CPU fallback confirmed working; WebGPU needs vulkan-loader config in Phase 2+

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 01-02-PLAN.md -- Transformers.js inference spike. Phase 1 COMPLETE.
Resume file: None
