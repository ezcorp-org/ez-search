# Milestone v1.0: MVP

**Status:** SHIPPED 2026-02-23
**Phases:** 1-8
**Total Plans:** 14

## Overview

ez-search delivers local semantic search over code, text, and images through a bottom-up build: validate risky dependencies (Zvec, WebGPU), build infrastructure and core services, wire up the code indexing pipeline end-to-end with one model, add the query path, extend to multi-model routing (text and images), and finish with status reporting and polish. The critical path runs through the validation spike -- if Zvec or WebGPU fail, alternatives must be swapped before any pipeline work begins.

## Phases

### Phase 1: Validation Spike
**Goal**: Risky dependencies are confirmed working on NixOS, or fallbacks are identified and committed to
**Depends on**: Nothing (first phase)
**Requirements**: VALID-01, VALID-02
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md -- Zvec CRUD validation at realistic scale (1000+ vectors, 768 dims)
- [x] 01-02-PLAN.md -- Transformers.js WebGPU/CPU inference with embedding quality validation

### Phase 2: Foundation and Infrastructure
**Goal**: All infrastructure modules exist and are independently testable -- the project skeleton is ready for pipeline integration
**Depends on**: Phase 1
**Requirements**: IDX-05, IDX-08, INFRA-01, INFRA-02, INFRA-04, INFRA-05
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md -- Project scaffold, types, path utilities, and CLI skeleton with lazy loading
- [x] 02-02-PLAN.md -- File scanner with ignore parsing and type classification
- [x] 02-03-PLAN.md -- Vector DB wrapper and model router services

### Phase 3: Code Indexing Pipeline
**Goal**: User can index a codebase and see it stored as searchable vector embeddings with incremental caching
**Depends on**: Phase 2
**Requirements**: IDX-01, IDX-04, IDX-06, IDX-07, INFRA-03, INFRA-06
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md -- Manifest cache, incremental change detection, and foundation updates (types, scanner, vector-db schema v2)
- [x] 03-02-PLAN.md -- Token-accurate code chunking with line number tracking
- [x] 03-03-PLAN.md -- Index command wiring: scanner to chunker to embedder to store

### Phase 4: Search and Query
**Goal**: User can search their indexed codebase with natural language and get useful, machine-parseable results
**Depends on**: Phase 3
**Requirements**: SRCH-01, SRCH-03, SRCH-04, SRCH-05
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md -- Full query pipeline: embed query, vector search, score normalization, chunk collapsing, JSON/text output, all flags (--top-k, --dir, --threshold, --format)

### Phase 5: Multi-Model Routing
**Goal**: User can index and search text documents and images alongside code, with automatic file type detection
**Depends on**: Phase 4
**Requirements**: IDX-02, IDX-03, SRCH-02
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md -- Text chunker service with paragraph-boundary splitting and PDF extraction
- [x] 05-02-PLAN.md -- CLIP image embedding service with fp32 vision model
- [x] 05-03-PLAN.md -- Auto-detection routing: multi-type index and grouped multi-collection query

### Phase 6: Status and Polish
**Goal**: User has visibility into their index state and the tool handles edge cases gracefully
**Depends on**: Phase 5
**Requirements**: STAT-01
**Plans**: 1 plan

Plans:
- [x] 06-01-PLAN.md -- Status command implementation with JSON/text output, shared error utility, error normalization across all commands

### Phase 7: Gap Closure
**Goal**: Close audit gaps -- query only loads models for indexed types, EMPTY_DIR error fires, dead code removed
**Depends on**: Phase 6
**Requirements**: SRCH-02 (partial -> satisfied)
**Gap Closure**: Closes gaps from v1-MILESTONE-AUDIT.md
**Plans**: 1 plan

Plans:
- [x] 07-01-PLAN.md -- Query manifest pre-detection, EMPTY_DIR wiring, dead code cleanup

### Phase 8: Project-Scoped Storage
**Goal**: Index data stored at `<project>/.ez-search/` instead of `~/.ez-search/<hash>/`; shared models remain at `~/.ez-search/models/`
**Depends on**: Phase 6
**Plans**: 1 plan

Plans:
- [x] 08-01-PLAN.md -- Refactor storage paths and manifest location to project-scoped layout

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Validation Spike | 2/2 | Complete | 2026-02-23 |
| 2. Foundation and Infrastructure | 3/3 | Complete | 2026-02-22 |
| 3. Code Indexing Pipeline | 3/3 | Complete | 2026-02-22 |
| 4. Search and Query | 1/1 | Complete | 2026-02-22 |
| 5. Multi-Model Routing | 3/3 | Complete | 2026-02-23 |
| 6. Status and Polish | 1/1 | Complete | 2026-02-23 |
| 7. Gap Closure | 1/1 | Complete | 2026-02-23 |
| 8. Project-Scoped Storage | 1/1 | Complete | 2026-02-23 |

---

## Milestone Summary

**Key Decisions:**

- WebGPU over CPU/WASM: Hardware acceleration for embeddings (CPU fallback confirmed working)
- Zvec over alternatives: In-process C++ DB, no server, local-only (confirmed on NixOS)
- Lazy model loading: Cold start under 200ms (22ms measured for --help)
- Batch size of 32: Prevents VRAM OOM while leveraging parallelism
- Project-scoped storage: .ez-search/ in project root (consistent with .git/)
- COSINE distance semantics: Zvec returns distance (0=exact), convert via 1-distance for scores

**Issues Resolved:**

- Zvec ESM/CJS interop via createRequire()
- WebGPU NixOS vulkan-loader requirement identified
- Xenova model mirrors returning 401 -- switched to official model IDs
- Tokenizer encode() returning array-like (not Array) -- used Array.from()
- CLIP quantized models failing -- fp32 required

**Issues Deferred:**

- Image-to-image search (v2 ASRCH-02)
- MCP server integration (v2 MCP-01, MCP-02)

**Technical Debt:**

- Image query from text returns UNSUPPORTED_TYPE (architectural limitation, v2 fix)

---

_For current project status, see .planning/MILESTONES.md_
