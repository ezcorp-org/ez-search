---
phase: 03-code-indexing-pipeline
plan: 03
subsystem: cli
tags: [commander, file-scanner, manifest-cache, chunker, model-router, vector-db, jina, zvec, embedding, incremental-indexing]

# Dependency graph
requires:
  - phase: 03-01
    provides: manifest-cache service with loadManifest/saveManifest/clearManifest/hashContent/hashText/makeChunkId
  - phase: 03-02
    provides: chunker service with loadTokenizer/chunkFile and 500/50 token sliding window
  - phase: 02
    provides: file-scanner, vector-db (openProjectCollections, VectorCollection), model-router (createEmbeddingPipeline)
provides:
  - Full end-to-end index pipeline: ez-search index . scans, chunks, embeds via Jina, stores in Zvec
  - Incremental re-indexing: second run with no changes completes near-instantly via manifest cache
  - Chunk-level diff: only re-embeds chunks whose text actually changed
  - --clear flag: wipes entire vector storage + manifest before re-indexing
  - --pretty flag: human-readable output on index command
  - --type text/image: returns structured JSON error (Phase 5 not yet implemented)
  - Batch embedding: processes in groups of 32 chunks per embed() call
affects: [04-search-command, 05-text-pipeline, 06-image-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy service imports: all heavy service imports via await import() inside runIndex() body"
    - "Batch embedding: collect all pending chunks first, then process in BATCH_SIZE=32 groups"
    - "Optimize-then-save: col768.optimize() always called before saveManifest() — manifest is integrity marker"
    - "Chunk-level diff: compare textHash per chunk index, skip re-embed if unchanged"
    - "Clear pattern: rmSync(storagePath, {recursive, force}) + reopen collections + clearManifest()"

key-files:
  created: []
  modified:
    - src/cli/commands/index-cmd.ts
    - src/cli/index.ts

key-decisions:
  - "--pretty on index command added to match query command pattern (both commands now have --pretty)"
  - "typeFilter defaults to 'code' when --type is not specified (Phase 3 is code-only pipeline)"
  - "Entire storagePath wiped on --clear (not just col-768) so schema-version.json is also removed"
  - "Error handling: catch wraps entire pipeline, outputs JSON error to stdout without writing manifest"
  - "Chunk-level diff by index position: oldChunks[chunk.chunkIndex] compared by textHash"

patterns-established:
  - "All five pipeline services lazily imported inside runIndex() body"
  - "Stats tracking: filesScanned/Indexed/Skipped and chunksCreated/Reused/Removed throughout"
  - "status: 'no_changes' when filesIndexed === 0 && deletedPaths.length === 0"

# Metrics
duration: 8min
completed: 2026-02-22
---

# Phase 3 Plan 3: Index Command Pipeline Summary

**Full scan->chunk->embed->store pipeline wiring `ez-search index .` with incremental caching, chunk-level diff, batch-32 embedding, and structured JSON output**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-22T21:33:00Z
- **Completed:** 2026-02-22T21:41:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced index-cmd.ts stub with full 310-line pipeline implementation connecting all five Phase 2/3 services
- Incremental indexing: mtime+size fast path, SHA-256 confirmation for same-size edits, chunk-level textHash diff
- Batch embedding in groups of 32 with lazy pipeline loading (only loaded when there are chunks to embed)
- --clear wipes entire storagePath + manifest then reopens fresh collections
- --pretty flag added to index command (matching query command pattern)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --pretty flag to index CLI command** - `e96cb89` (feat)
2. **Task 2: Implement full index command pipeline** - `8447daa` (feat, captured in "Add gitignore and project files" commit)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/cli/commands/index-cmd.ts` - Full pipeline: scan->manifest->chunk->embed(batched)->store->optimize->save
- `src/cli/index.ts` - Added --pretty flag to index command

## Decisions Made

- **typeFilter defaults to 'code'**: When `--type` is not specified, Phase 3 defaults to code pipeline only. Text/image return structured errors.
- **Entire storagePath wiped on --clear**: `rmSync(storagePath, {recursive: true, force: true})` removes col-768, col-512, and schema-version.json atomically, then `openProjectCollections()` recreates everything fresh.
- **Optimize-then-save ordering enforced**: `col768.optimize()` is called before `saveManifest()`. If optimize throws, manifest is not written — ensuring the manifest only reflects successfully indexed data.
- **Chunk-level diff by index position**: `existingChunks[chunk.chunkIndex]` compared by `textHash`. Chunks that are unchanged (same index, same hash) skip re-embedding and count as `chunksReused`.
- **Lazy pipeline loading**: Tokenizer and embedding pipeline are only loaded when `filesToProcess.length > 0` and `allPendingChunks.length > 0` respectively. Zero-change runs skip all heavy imports.
- **Error output pattern**: `catch` wraps entire pipeline body; errors go to `console.log(JSON.stringify({status:'error', message}))` for JSON mode, `console.error()` for --pretty mode. Manifest is never written on error.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compiled cleanly on first attempt, all five service wiring points confirmed by grep.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ez-search index .` is fully wired end-to-end. Running it on a TypeScript project will scan code files, chunk them with the Jina BPE tokenizer, embed via jinaai/jina-embeddings-v2-base-code (CPU q8 fallback), and store in Zvec col-768.
- Second run will detect no changes via manifest cache and complete near-instantly.
- Phase 4 (search command) can now call `openProjectCollections()` and `col768.query()` with embeddings from `createEmbeddingPipeline('code').embed()`.
- No blockers.

---
*Phase: 03-code-indexing-pipeline*
*Completed: 2026-02-22*
