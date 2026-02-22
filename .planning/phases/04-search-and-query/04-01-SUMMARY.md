---
phase: 04-search-and-query
plan: 01
subsystem: search
tags: [transformers.js, zvec, jina, embeddings, cli, semantic-search]

# Dependency graph
requires:
  - phase: 03-code-indexing-pipeline
    provides: col-768 vector collection with chunkText, filePath, chunkIndex, lineStart, lineEnd metadata
  - phase: 02-foundation-and-infrastructure
    provides: vector-db.ts openProjectCollections, model-router.ts createEmbeddingPipeline, manifest-cache.ts loadManifest
provides:
  - Full query pipeline: embed -> search -> normalize -> filter -> collapse -> output
  - JSON output schema: { query, results[{ file, lines, score, text }], totalIndexed, searchScope }
  - --format text human-readable output
  - --top-k, --dir, --threshold, --format flags on query command
  - --format replaces --pretty on both index and query commands
affects:
  - phase-05-text-and-image-search (extends query command for text/image types)
  - phase-06-performance (query pipeline is the hot path to optimize)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Score normalization: 1 - COSINE distance, clamped [0,1], rounded to 4 decimal places"
    - "Adjacent chunk collapsing: group by file, sort by chunkIndex, merge consecutive runs"
    - "Over-fetch pattern: fetch topK*3 when post-filters active to ensure sufficient results after filtering"

key-files:
  created: []
  modified:
    - src/cli/commands/query-cmd.ts
    - src/cli/index.ts
    - src/cli/commands/index-cmd.ts

key-decisions:
  - "COSINE distance -> score conversion confirmed: score = 1 - distance (distance=0 is exact match)"
  - "Over-fetch 3x when --dir or --threshold active; exact fetch otherwise"
  - "Consecutive chunk merging defined as chunkIndex difference of exactly 1"
  - "--format text replaces --pretty for consistency across all output-bearing commands"

patterns-established:
  - "Query pipeline over-fetch pattern: fetch more than needed when post-filters will reduce results"
  - "Chunk collapsing: sort by chunkIndex, merge consecutive runs, take max score per run"

# Metrics
duration: 7min
completed: 2026-02-22
---

# Phase 4 Plan 1: Query Command Summary

**`ez-search query` command implemented: Jina code embedding, Zvec col-768 ANN search, score normalization, adjacent chunk collapsing, and JSON/text output with --top-k, --dir, --threshold, --format flags**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-02-23T03:19:19Z
- **Completed:** 2026-02-23T03:26:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Implemented full query pipeline in query-cmd.ts: embed query, search col-768, normalize scores, filter, collapse, output
- Replaced `--pretty` with `--format <mode>` on both `index` and `query` commands for consistent flag naming
- Added `--threshold <score>` flag to query command for score-based result filtering
- TypeScript compiles clean, CLI help shows correct flags

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement query pipeline in query-cmd.ts** - `e4e5426` (feat)
2. **Task 2: Replace --pretty with --format across CLI commands** - `0fef36d` (feat)

## Files Created/Modified

- `src/cli/commands/query-cmd.ts` - Full query pipeline: embed -> Zvec query -> normalize -> filter -> collapse -> output JSON/text
- `src/cli/index.ts` - Updated query command with --format, --threshold flags; updated index command with --format; removed --pretty from both
- `src/cli/commands/index-cmd.ts` - Updated options type and replaced all `options.pretty` references with `options.format === 'text'`

## Decisions Made

- **Over-fetch factor of 3x** when post-filters (--dir, --threshold) are active, to ensure enough candidates survive filtering before slice to topK.
- **Consecutive defined as chunkIndex diff == 1** — non-consecutive chunks from the same file produce separate collapsed results, each ranked independently.
- **Score = 1 - distance, clamped to [0,1], rounded to 4 decimals** — preserves precision while keeping output clean.
- **Empty collection handled gracefully** — Zvec query errors are caught, pipeline returns empty results with message rather than crashing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ez-search query "..."` is fully functional end-to-end
- JSON output schema matches spec: `{ query, results[{ file, lines: {start, end}, score, text }], totalIndexed, searchScope }`
- Text output format: `File: <path> | Lines: <start>-<end> | Relevance: <score>` with indented chunk text
- Ready for Phase 5 (text/image pipelines) to extend query command with additional type support

---
*Phase: 04-search-and-query*
*Completed: 2026-02-23*
