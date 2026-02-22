---
phase: 05-multi-model-routing
plan: 03
subsystem: indexing, search
tags: [transformers.js, jina, nomic, clip, vector-search, multi-model, typescript]

# Dependency graph
requires:
  - phase: 05-01
    provides: text-chunker.ts with paragraph-boundary chunking and PDF extraction
  - phase: 05-02
    provides: image-embedder.ts with CLIP ViT-B/32 fp32 pipeline
  - phase: 03-code-indexing-pipeline
    provides: index-cmd.ts code pipeline, manifest-cache, chunker, file-scanner
  - phase: 04-search-and-query
    provides: query-cmd.ts with Jina code search, col768 query logic
provides:
  - Multi-type index pipeline in index-cmd.ts routing code/text/image automatically
  - Multi-collection grouped query in query-cmd.ts with Jina+Nomic search
  - Extended EXTENSION_MAP in types.ts with csv, json, yaml, yml, toml, pdf
  - --type option added to query command CLI
affects: [06-phase-6, any future search enhancements, image search phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "runTextEmbeddingPipeline() shared helper for code and text (DRY manifest/embed/insert loop)"
    - "Sequential pipeline load/dispose pattern for memory conservation (never load Jina+Nomic simultaneously)"
    - "Over-fetch topK*5 then modelId-filter for mixed col-768"
    - "Nomic task prefix applied at embed time: search_document: for index, search_query: for query"
    - "Deletion detection scoped to file type via EXTENSION_MAP"
    - "Grouped JSON envelope: { code: [...], text: [...] } with optional keys"

key-files:
  created: []
  modified:
    - src/types.ts
    - src/cli/commands/index-cmd.ts
    - src/cli/commands/query-cmd.ts
    - src/cli/index.ts

key-decisions:
  - "runTextEmbeddingPipeline() helper shared between code and text pipelines (differ only in chunker/model/prefix)"
  - "Deletion detection per type using EXTENSION_MAP to scope which manifest entries belong to each pipeline"
  - "col768 optimize() always called; col512 optimize() only when image files were actually processed"
  - "Image query (text-to-image) deferred — returns stderr error message, not a hard failure"
  - "--type option added to query command (was missing from CLI definition)"
  - "fetchCount = topK * 5 * (hasPostFilters ? 3 : 1) to handle both mixed col-768 and post-filters"

patterns-established:
  - "Grouped output pattern: only include JSON keys that have results (no empty arrays)"
  - "Text output uses ## headers for type grouping; omits Lines: for text results"

# Metrics
duration: 15min
completed: 2026-02-23
---

# Phase 5 Plan 3: Multi-Model Routing Integration Summary

**Auto-routing index command (code+text+image) and grouped query (Jina/Nomic) with shared pipeline helper and EXTENSION_MAP extended to csv/json/yaml/pdf**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-23T13:37:00Z
- **Completed:** 2026-02-23T13:52:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Index command now processes all three file types automatically when `--type` is omitted
- Text pipeline uses Nomic with "search_document: " prefix; PDF files use extractPdfText() before chunking
- Image pipeline uses CLIP ViT-B/32 into col-512 (one vector per image)
- Query command searches code (Jina) and text (Nomic) with grouped output envelope
- Shared `runTextEmbeddingPipeline()` helper eliminates duplication between code and text pipelines

## Task Commits

1. **Task 1: Extend EXTENSION_MAP and multi-type index routing** - `984b505` (feat)
2. **Task 2: Multi-collection grouped query** - `294590c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/types.ts` - Added .csv (text), .pdf (text), .json/.yaml/.yml/.toml (code) to EXTENSION_MAP
- `src/cli/commands/index-cmd.ts` - Full rewrite: multi-type routing, shared helper, image pipeline, per-type deletion scoping
- `src/cli/commands/query-cmd.ts` - Full rewrite: Jina+Nomic sequential queries, modelId filtering, grouped JSON/text output
- `src/cli/index.ts` - Added --type option to query command definition

## Decisions Made

- **Shared pipeline helper (DRY):** `runTextEmbeddingPipeline()` accepts `type: 'code' | 'text'` and handles chunking, manifest diff, and batch embedding. The key differences (chunker function, model type, task prefix, tokenizer) are captured by the type parameter.
- **Deletion scoped by EXTENSION_MAP:** Each type's deletion detection filters manifest keys by file extension to avoid cross-type interference.
- **col512 optimize only when needed:** `imageFilesProcessed` flag prevents calling `col512.optimize()` when no image files were processed.
- **Image query deferred gracefully:** `--type image` on query prints a helpful stderr message and exits cleanly rather than throwing.
- **fetchCount formula:** `topK * 5 * (hasPostFilters ? 3 : 1)` combines over-fetch for mixed col-768 (5x) with over-fetch for post-filters (3x).

## Deviations from Plan

None - plan executed exactly as written. The `--type` addition to the query CLI command was noted in the plan as a required step ("IMPORTANT: The query command in src/cli/index.ts does NOT currently have a --type option. You need to add it there too.").

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 (Multi-Model Routing) is fully complete. All three pipelines are wired.
- Ready for Phase 6: any remaining features (image query, status improvements, etc.)
- Col-768 now contains mixed code+text vectors; modelId field distinguishes them
- Col-512 used for image vectors (CLIP 512-dim)
- End-to-end flows ready: `ez-search index .` indexes all types, `ez-search query "..."` searches code+text with grouped results

---
*Phase: 05-multi-model-routing*
*Completed: 2026-02-23*
