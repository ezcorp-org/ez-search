# Requirements Archive: v1.0 MVP

**Archived:** 2026-02-23
**Status:** SHIPPED

This is the archived requirements specification for v1.0.

---

# Requirements: ez-search

**Defined:** 2026-02-22
**Core Value:** Developers can semantically search their codebase locally with zero cloud dependencies -- fast enough to be useful as a retrieval engine for AI assistants.

## v1 Requirements

### Validation

- [x] **VALID-01**: Zvec Node.js SDK installs and runs basic CRUD operations on target system
- [x] **VALID-02**: WebGPU inference works via Transformers.js v4 on target system, with fallback to WASM/CPU confirmed

### Indexing

- [x] **IDX-01**: User can index a directory of code files (.ts, .js, .py, .go, .rs, .c, .cpp) into vector embeddings using Jina code model
- [x] **IDX-02**: User can index text/document files (.md, .txt, .pdf, .csv) using Nomic text model
- [x] **IDX-03**: User can index image files (.jpg, .png, .webp) using CLIP model
- [x] **IDX-04**: Incremental indexing skips unchanged files using mtime/size check + xxhash content verification
- [x] **IDX-05**: All index state stored in `<project>/.ez-search/` directory (updated from original ~/.ez-search/<hash>/ spec)
- [x] **IDX-06**: User can force a specific pipeline with `--type <code|text|image>` flag
- [x] **IDX-07**: User can clear existing index with `--clear` flag
- [x] **IDX-08**: Separate vector collections per model type (768-dim for code/text, 512-dim for images)

### Search

- [x] **SRCH-01**: User can query indexed embeddings with natural language and get ranked results
- [x] **SRCH-02**: Auto-detect which model pipeline to use based on indexed content types
- [x] **SRCH-03**: Machine-readable output format: `File: <path> | Lines: <start>-<end> | Relevance: <score>`
- [x] **SRCH-04**: User can control number of results with `--top-k` flag (default 10)
- [x] **SRCH-05**: User can target a specific directory with `--dir` flag (default `.`)

### Infrastructure

- [x] **INFRA-01**: WebGPU inference with graceful fallback to WASM/CPU when GPU unavailable
- [x] **INFRA-02**: Lazy model loading -- models loaded only after command is parsed (cold start <1.5s)
- [x] **INFRA-03**: Batch WebGPU inference in batches of 32 to avoid VRAM OOM
- [x] **INFRA-04**: Respect .gitignore and .cursorignore for file exclusion during indexing
- [x] **INFRA-05**: User can disable ignore file exclusion with a flag (e.g., `--no-ignore`)
- [x] **INFRA-06**: Text/code chunking with ~500 token chunks and 50 token overlap, tracking start/end line numbers

### Status

- [x] **STAT-01**: User can run `ez-search status` to see index info (file count, last indexed, model types, size)

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VALID-01 | Phase 1 | Complete |
| VALID-02 | Phase 1 | Complete |
| IDX-01 | Phase 3 | Complete |
| IDX-02 | Phase 5 | Complete |
| IDX-03 | Phase 5 | Complete |
| IDX-04 | Phase 3 | Complete |
| IDX-05 | Phase 8 | Complete |
| IDX-06 | Phase 3 | Complete |
| IDX-07 | Phase 3 | Complete |
| IDX-08 | Phase 2 | Complete |
| SRCH-01 | Phase 4 | Complete |
| SRCH-02 | Phase 7 | Complete |
| SRCH-03 | Phase 4 | Complete |
| SRCH-04 | Phase 4 | Complete |
| SRCH-05 | Phase 4 | Complete |
| INFRA-01 | Phase 2 | Complete |
| INFRA-02 | Phase 2 | Complete |
| INFRA-03 | Phase 3 | Complete |
| INFRA-04 | Phase 2 | Complete |
| INFRA-05 | Phase 2 | Complete |
| INFRA-06 | Phase 3 | Complete |
| STAT-01 | Phase 6 | Complete |

**Coverage:**
- v1 requirements: 22 total
- Shipped: 22
- Dropped: 0

---

## Milestone Summary

**Shipped:** 22 of 22 v1 requirements
**Adjusted:** IDX-05 changed from `~/.ez-search/<hash>/` to `<project>/.ez-search/` (Phase 8)
**Dropped:** None

---
*Archived: 2026-02-23 as part of v1.0 milestone completion*
