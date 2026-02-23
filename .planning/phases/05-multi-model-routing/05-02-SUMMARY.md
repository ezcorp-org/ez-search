---
phase: 05-multi-model-routing
plan: 02
subsystem: embeddings
tags: [clip, transformers.js, image-embedding, onnxruntime, fp32, huggingface]

# Dependency graph
requires:
  - phase: 02-foundation-and-infrastructure
    provides: resolveModelCachePath() used for model weight caching
provides:
  - CLIP ViT-B/32 image embedding pipeline (512-dim, fp32)
  - createImageEmbeddingPipeline() factory function
  - ImageEmbeddingPipeline interface with embedImage()/dispose() methods
affects: [05-03, indexer pipeline, image file ingestion]

# Tech tracking
tech-stack:
  added: []
  patterns: [CLIPVisionModelWithProjection for vision-only encoding, fp32 required for onnxruntime-node CLIP, file:// prefix for RawImage.fromURL local paths]

key-files:
  created:
    - src/services/image-embedder.ts
  modified: []

key-decisions:
  - "dtype: 'fp32' required — quantized CLIP (int8/uint8) fails with ConvInteger(10) not implemented in onnxruntime-node"
  - "CLIPVisionModelWithProjection used (not full CLIP model) — vision-only encoder sufficient for image embeddings"
  - "RawImage.fromURL requires file:// prefix for local paths — bare absolute paths may not work on all platforms"
  - "Promise.all for parallel processor + model loading — reduces startup latency"

patterns-established:
  - "CLIP image pipeline: AutoProcessor → RawImage.fromURL → processor(image) → visionModel(inputs) → image_embeds.data.slice(0, 512)"
  - "dispose() pattern: cast to unknown first when type returns Promise<unknown[]> vs Promise<void>"

# Metrics
duration: 1min
completed: 2026-02-23
---

# Phase 5 Plan 2: CLIP Image Embedding Service Summary

**CLIPVisionModelWithProjection fp32 image embedding pipeline producing 512-dim Float32Array per image, with file:// URI handling and parallel model loading**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-23T13:35:16Z
- **Completed:** 2026-02-23T13:36:11Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created `src/services/image-embedder.ts` with `createImageEmbeddingPipeline()` factory
- CLIP ViT-B/32 with forced `dtype: 'fp32'` to avoid onnxruntime-node ConvInteger failure
- Parallel loading of AutoProcessor and CLIPVisionModelWithProjection for fast startup
- RawImage.fromURL with `file://` prefix for reliable local file access

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CLIP image embedding service** - `d57a6f7` (feat)

**Plan metadata:** (included in summary commit below)

## Files Created/Modified
- `src/services/image-embedder.ts` - CLIP image embedding pipeline with createImageEmbeddingPipeline() and ImageEmbeddingPipeline interface

## Decisions Made
- **fp32 required, not quantized:** Quantized CLIP (int8, uint8) uses the ConvInteger ONNX operator which is not implemented in onnxruntime-node. The plan specified this; enforced with explicit comment in code.
- **CLIPVisionModelWithProjection over full CLIP:** Only the vision encoder is needed for image embeddings; the text encoder is unused.
- **file:// URI prefix:** `RawImage.fromURL` is most reliable with file:// prefix for local absolute paths. Documented in code comment.
- **Cast through unknown for dispose():** The visionModel.dispose() returns `Promise<unknown[]>` per Transformers.js types; casting through `unknown` avoids the TypeScript type-incompatibility error seen with direct casting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type cast error in dispose() method**
- **Found during:** Task 1 verification (npx tsc --noEmit)
- **Issue:** Casting `PreTrainedModel` to `{ dispose?: () => Promise<void> }` failed because `PreTrainedModel.dispose()` returns `Promise<unknown[]>`, not `Promise<void>` — types are incompatible without double-cast
- **Fix:** Cast through `unknown` first: `visionModel as unknown as { dispose?: () => Promise<unknown> }`
- **Files modified:** src/services/image-embedder.ts
- **Verification:** `npx tsc --noEmit` passes with no errors in image-embedder.ts
- **Committed in:** d57a6f7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type-cast fix required for TypeScript strict mode compliance. No functional change.

## Issues Encountered
- Pre-existing TypeScript error in `src/services/text-chunker.ts` (pdf-parse `.default` import) — not introduced by this plan, not fixed (out of scope).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ImageEmbeddingPipeline is ready for integration in Phase 5 Plan 3 (indexer pipeline wiring)
- embedImage(absolutePath) returns 512-dim Float32Array — matches CLIP_DIM constant
- dispose() releases visionModel resources when indexer shuts down
- No blockers

---
*Phase: 05-multi-model-routing*
*Completed: 2026-02-23*
