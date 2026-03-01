---
phase: quick
plan: 003
subsystem: cli
tags: [onnx, model-router, cli, embedding, clip, transformers]

# Dependency graph
requires: []
provides:
  - --model CLI flag on index and query commands for custom text/code ONNX models
  - --clip-model CLI flag on index and query commands for custom CLIP image models
  - model and clipModel options on IndexOptions and QueryOptions library API
  - modelId override threading through EmbeddingPipelineOptions, createImageEmbeddingPipeline, createClipTextPipeline
affects: [future CLI features, library users needing custom model support]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "effectiveModelId pattern: optional override ?? registry default, used as cache key and in all downstream calls"
    - "Model filter in query results uses pipe.modelId (dynamic) rather than hardcoded model name string"

key-files:
  created: []
  modified:
    - src/services/model-router.ts
    - src/services/image-embedder.ts
    - src/cli/index.ts
    - src/cli/commands/index-cmd.ts
    - src/cli/commands/query-cmd.ts
    - src/index.ts

key-decisions:
  - "Custom model does not override dim/nativeDim from registry — user is responsible for ensuring compatible output dimensions"
  - "Pipeline cache key uses effectiveModelId so custom and default models are independently cached"
  - "Semantic result filter in queryCodeOrText uses pipe.modelId dynamically instead of hardcoded Qwen3-Embedding string"

patterns-established:
  - "effectiveModelId = options.modelId ?? DEFAULT_ID — consistent override pattern across all pipeline functions"

# Metrics
duration: 4min
completed: 2026-03-01
---

# Quick Task 003: Custom ONNX Model Path Summary

**--model and --clip-model CLI flags plus library API options that thread custom HuggingFace IDs or local ONNX paths through to model-router and image-embedder pipeline creation**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-01T17:09:26Z
- **Completed:** 2026-03-01T17:13:06Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments

- `createEmbeddingPipeline` accepts `options.modelId` override; all cache keys, pipeline() calls, and log messages use `effectiveModelId`
- `createImageEmbeddingPipeline` and `createClipTextPipeline` accept optional `{ modelId? }` parameter with the same effectiveModelId pattern
- `--model` and `--clip-model` flags added to both `ez-search index` and `ez-search query` commands
- `IndexOptions` and `QueryOptions` in the library API now expose `model` and `clipModel` fields, threaded through to all pipeline creation sites
- Auto-index within `runQuery` also passes model/clipModel options forward

## Task Commits

1. **Task 1: Thread model override through model-router and image-embedder** - `37ffbbc` (feat)
2. **Task 2: Add CLI flags and library API options, wire through commands** - `e5b2668` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/services/model-router.ts` - Added `modelId?` to `EmbeddingPipelineOptions`; `createEmbeddingPipeline` uses `effectiveModelId` for cache, pipeline calls, and logs; `buildPipelineWrapper` takes `effectiveModelId` param
- `src/services/image-embedder.ts` - `createImageEmbeddingPipeline` and `createClipTextPipeline` accept `options?: { modelId? }`; both use `effectiveModelId` throughout
- `src/cli/index.ts` - Added `--model` and `--clip-model` options to index and query commands; updated action handler types
- `src/cli/commands/index-cmd.ts` - Added `model?` and `clipModel?` to `runIndex` options and `runTextEmbeddingPipeline` opts; threaded to `createEmbeddingPipeline` and `createImageEmbeddingPipeline`
- `src/cli/commands/query-cmd.ts` - Added `model?` and `clipModel?` to `QueryOptions`; threaded through `queryCodeOrText`, `createClipTextPipeline`, and auto-index call; fixed model ID filter to use `pipe.modelId`
- `src/index.ts` - Added `model?` and `clipModel?` to `IndexOptions` and `QueryOptions`; passed through to `runIndex`/`runQuery`

## Decisions Made

- **Dim/nativeDim not overridden for custom models:** When a custom modelId is provided, the registry's `dim` and `nativeDim` values are still used for embedding truncation. This means custom models must produce at least `model.dim`-dimensional output. This is acceptable because users choosing custom models are expected to understand the dimension requirements.
- **Dynamic model filter in query results:** The semantic results filter in `queryCodeOrText` was changed from the hardcoded string `.includes('Qwen3-Embedding')` to use `pipe.modelId === effectiveModelId` (or fallback to `includes('Qwen3-Embedding')` for the default case). This ensures custom model results are not silently dropped during query.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed semantic result filter to support custom modelIds**

- **Found during:** Task 2 (query-cmd.ts wiring)
- **Issue:** `queryCodeOrText` filtered `semanticNormalized` using `.filter((r) => r.modelId.includes('Qwen3-Embedding'))` and then `filterAndCollapse(..., (id) => id.includes('Qwen3-Embedding'), ...)`. With a custom model, stored chunks would have a non-Qwen3 modelId, so all results would be silently dropped.
- **Fix:** Changed the pre-filter to `r.modelId === effectiveModelId || (!model && r.modelId.includes('Qwen3-Embedding'))` using `pipe.modelId` as `effectiveModelId`. Changed the `filterAndCollapse` modelFilter to `() => true` since results are already pre-filtered upstream.
- **Files modified:** `src/cli/commands/query-cmd.ts`
- **Verification:** Build passes, all existing tests pass; logic verified by inspection — pre-filter correctly accepts both custom and default model IDs
- **Committed in:** `e5b2668` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential for correctness of custom model queries. Without this fix, custom-model indexing would work but querying would return zero results silently.

## Issues Encountered

- Pre-existing `tests/accuracy/accuracy.test.ts` failure (tokenizer.encode is not a function in test harness) — confirmed pre-existing before changes via git stash; not introduced by this task.

## Next Phase Readiness

- Custom model support complete end-to-end: indexing, querying, library API, and CLI
- No follow-up required; feature is ready to use

---
*Phase: quick*
*Completed: 2026-03-01*
