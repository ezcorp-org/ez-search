---
phase: 02-foundation-and-infrastructure
plan: 03
subsystem: database, infra
tags: [zvec, transformers.js, embeddings, vector-db, webgpu, onnxruntime, jina, nomic, huggingface]

# Dependency graph
requires:
  - phase: 02-01
    provides: resolveProjectStoragePath and resolveModelCachePath from src/config/paths.ts
  - phase: 01-validation-spike
    provides: confirmed Zvec CRUD operations, embedding models, CJS/ESM interop patterns, CPU fallback behavior
provides:
  - Zvec collection wrapper (openProjectCollections) creating col-768 and col-512 per project
  - EmbeddingPipeline factory (createEmbeddingPipeline) with WebGPU-to-CPU fallback
  - VectorCollection interface: insert, query, remove, optimize, close
  - EmbeddingPipeline interface: embed(), backend, modelId, dim, dispose()
affects:
  - 03-indexing-pipeline (consumes both services to build and store embeddings)
  - 04-query-engine (consumes both services to query embeddings)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "createRequire(import.meta.url) for importing CJS packages (@zvec/zvec) in ESM projects"
    - "WebGPU-to-CPU fallback via try/catch on pipeline() device parameter"
    - "env.cacheDir set before first pipeline() call to redirect HuggingFace cache"
    - "Lazy service modules — heavy imports stay out of CLI entry point"

key-files:
  created:
    - src/services/vector-db.ts
    - src/services/model-router.ts
  modified: []

key-decisions:
  - "close() on VectorCollection is a no-op — Zvec GC handles cleanup; destroySync() deletes from disk (not desired here)"
  - "embed() uses Promise.all for batch parallelism even with CPU — ONNX Runtime handles concurrency internally"
  - "dispose() guards against missing method — not all pipeline versions expose dispose()"

patterns-established:
  - "Service pattern: heavy dependencies isolated in src/services/, lazy-loaded by command handlers"
  - "ID validation at insert boundary: colons rejected with descriptive error before Zvec sees them"
  - "Metadata round-tripping: fields stored as typed Zvec fields, reconstructed into VectorMetadata on query"

# Metrics
duration: 25min
completed: 2026-02-22
---

# Phase 2 Plan 3: Vector DB Wrapper and Model Router Summary

**Zvec collection wrapper (col-768 + col-512 per project) and Transformers.js embedding pipeline factory with WebGPU-to-CPU fallback, both smoke-tested and type-safe**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-22T00:00:00Z
- **Completed:** 2026-02-22T00:25:00Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- `openProjectCollections` creates and opens both 768-dim and 512-dim Zvec collections under `~/.ez-search/<project>-<hash>/`
- `createEmbeddingPipeline` loads jinaai/jina-embeddings-v2-base-code with WebGPU attempted first, transparent CPU q8 fallback on failure
- Both services smoke-tested end-to-end: insert/optimize/query for vector DB, embed() for model router

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Zvec collection wrapper service** - `516d234` (feat)
2. **Task 2: Implement model router with WebGPU-to-CPU fallback** - `9fcdeb2` (feat)

## Files Created/Modified

- `src/services/vector-db.ts` — Zvec wrapper; `openProjectCollections`, `VectorCollection` interface, `createCollection` helper
- `src/services/model-router.ts` — Transformers.js pipeline factory; `createEmbeddingPipeline`, `EmbeddingPipeline` interface, `MODEL_REGISTRY`

## Decisions Made

- **close() is a no-op:** Zvec collection handles are garbage-collected; only `destroySync()` deletes from disk. No explicit close needed for normal operation.
- **Promise.all in embed():** Batch parallelism maintained even on CPU — ONNX Runtime handles internal concurrency, so batching via Promise.all is correct.
- **dispose() guard:** Not all Transformers.js pipeline versions expose `dispose()`. Added `typeof` guard to avoid runtime errors on older versions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- tsx treats files in /tmp without a package.json as CJS, rejecting top-level await. Resolved by wrapping smoke tests in `async function main()` or using `.mts` extension.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Vector DB and model router services are ready for Phase 3 (indexing pipeline)
- Phase 3 can call `openProjectCollections(projectDir)` and `createEmbeddingPipeline('code')` directly
- Nomic text model (`createEmbeddingPipeline('text')`) is available but not smoke-tested yet — callers must add task prefixes
- No blockers

---
*Phase: 02-foundation-and-infrastructure*
*Completed: 2026-02-22*
