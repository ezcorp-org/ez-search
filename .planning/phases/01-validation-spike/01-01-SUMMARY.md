---
phase: 01-validation-spike
plan: 01
subsystem: database
tags: [zvec, vector-db, hnsw, cosine, typescript, tsx, node, nixos]

# Dependency graph
requires: []
provides:
  - "@zvec/zvec v0.2.0 confirmed working on NixOS at 768-dim / 1000 docs"
  - "Zvec CRUD API patterns: createRequire import, ID format, score semantics"
  - "Timing baseline: 72ms insert-1000, 4ms query pre-optimize, 0.4ms post-optimize"
affects:
  - 01-validation-spike (plan 02 -- embeddings/WebGPU spike)
  - 02-core-indexing
  - 03-search-quality

# Tech tracking
tech-stack:
  added:
    - "@zvec/zvec v0.2.0"
    - "typescript v5.9"
    - "tsx v4.21"
  patterns:
    - "Use createRequire() to import @zvec/zvec (CommonJS) from ESM project"
    - "COSINE metric returns distance (0=exact match, lower=more similar), not similarity"
    - "Zvec IDs must match regex -- underscores ok, colons forbidden"
    - "optimizeSync before production queries -- 10x speedup observed"

key-files:
  created:
    - "spike/zvec-spike.ts"
    - "package.json"
    - "tsconfig.json"
  modified: []

key-decisions:
  - "Zvec passes viability check -- proceed with it as vector DB in Phase 2+"
  - "IDs must use underscores not colons (doc_123 not doc:123)"
  - "Always call optimizeSync after bulk loads for query performance"
  - "COSINE distance interpretation: 0.0 = exact match, values ascending = less similar"

patterns-established:
  - "Import pattern: createRequire(import.meta.url) required for @zvec/zvec in ESM"
  - "Spike structure: header() / pass() / fail() / timing() helpers for readable output"

# Metrics
duration: 22min
completed: 2026-02-23
---

# Phase 1 Plan 1: Zvec Validation Spike Summary

**@zvec/zvec v0.2.0 confirmed working on NixOS -- 1000x768-dim vectors, full CRUD, 72ms bulk insert, 0.4ms queries post-optimize**

## Performance

- **Duration:** 22 min
- **Started:** 2026-02-23T00:02:05Z
- **Completed:** 2026-02-23T00:24:00Z
- **Tasks:** 1 executed, 1 skipped (Zvec passed, no LanceDB fallback needed)
- **Files modified:** 3

## Accomplishments

- Proved @zvec/zvec installs and runs on NixOS with prebuilt linux-x64 binaries
- Validated all CRUD operations at realistic scale (1000 docs, 768 dimensions)
- Recorded timing baseline for future performance comparisons
- Documented critical API gotchas (CJS import, ID format, score semantics)

## Task Commits

1. **Task 1: Initialize project and Zvec spike script** - `f071616` (feat)
2. **Task 2: LanceDB fallback** - SKIPPED (Zvec passed)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `spike/zvec-spike.ts` - Full Zvec CRUD validation at 1000x768-dim scale
- `package.json` - Project setup with @zvec/zvec, typescript, tsx; ESM type
- `tsconfig.json` - ES2022/NodeNext targets for TypeScript

## Timing Data

| Operation | Time |
|-----------|------|
| Insert 1000 x 768-dim vectors | 72ms (0.07ms/doc) |
| Query topk=10 before optimizeSync | 4.3ms |
| optimizeSync | 44ms |
| Query topk=10 after optimizeSync | 0.4ms (10x speedup) |

## Decisions Made

1. **Zvec passes viability check** -- All CRUD operations pass at realistic scale. Proceed with Zvec as the vector DB in Phase 2+. No fallback to LanceDB needed.

2. **ID format constraint documented** -- Zvec rejects IDs containing colons via internal regex validation. All IDs in ez-search must use underscores or hyphens (e.g., `doc_123`, `chunk_abc-456`). This affects the document ID schema in Phase 2.

3. **COSINE score semantics** -- Zvec COSINE metric returns distance (0.0 = exact match, higher = less similar), not similarity. Ranking is ascending. Query results are correct but score interpretation is inverted from what some libraries return.

4. **optimizeSync is required for production performance** -- Pre-optimize query latency is ~4ms; post-optimize is ~0.4ms (10x). Must call optimizeSync after bulk inserts before serving queries.

5. **ESM/CJS interop** -- @zvec/zvec is CommonJS. In this ESM project, must use `createRequire(import.meta.url)` to load it. Named exports then destructure normally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ID format: colons rejected by Zvec regex**
- **Found during:** Task 1 (bulk insert)
- **Issue:** Plan specified IDs like `doc:0` which Zvec rejects with `ZVEC_INVALID_ARGUMENT: doc_id cannot pass regex verification`
- **Fix:** Changed all IDs to use underscores: `doc_0`, `doc_1`, etc.
- **Files modified:** spike/zvec-spike.ts
- **Verification:** Insert succeeds with 0 failures after fix
- **Committed in:** f071616

**2. [Rule 1 - Bug] Fixed CJS import: @zvec/zvec incompatible with ESM named imports**
- **Found during:** Task 1 (initial execution)
- **Issue:** `import { ZVecCollectionSchema } from '@zvec/zvec'` fails because the package is CommonJS
- **Fix:** Replaced ESM import with `createRequire(import.meta.url)` pattern
- **Files modified:** spike/zvec-spike.ts
- **Verification:** All exports load correctly, script runs to completion
- **Committed in:** f071616

**3. [Rule 1 - Bug] Fixed COSINE score ranking: ascending not descending**
- **Found during:** Task 1 (query verification)
- **Issue:** Plan assumed COSINE similarity (higher=better, descending). Zvec returns COSINE distance (lower=better, ascending). Ranking check was inverted.
- **Fix:** Corrected ranking assertion to check ascending order; updated documentation
- **Files modified:** spike/zvec-spike.ts
- **Verification:** Ranking check passes; doc_0 scores 0.000000 (exact match) and appears first
- **Committed in:** f071616

---

**Total deviations:** 3 auto-fixed (all Rule 1 - Bug)
**Impact on plan:** All three fixes were necessary for correct execution. No scope creep. The ID format and score semantics are important findings that constrain Phase 2 design.

## Issues Encountered

None beyond the auto-fixed deviations above.

## Next Phase Readiness

**Ready:** Zvec is proven. Phase 2 (core indexing) can build on it with confidence.

**Constraints for Phase 2:**
- Use `createRequire(import.meta.url)` when importing @zvec/zvec
- IDs must not contain colons -- use underscores or hyphens
- COSINE scores are distances (0=best); ascending sort for ranking
- Call optimizeSync after bulk loads before serving queries

**Remaining Phase 1 work:** Plan 02 (embeddings + WebGPU spike) still needed.

---
*Phase: 01-validation-spike*
*Completed: 2026-02-23*
