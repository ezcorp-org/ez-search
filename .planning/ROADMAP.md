# Roadmap: ez-search

## Overview

ez-search delivers local semantic search over code, text, and images through a bottom-up build: validate risky dependencies (Zvec, WebGPU), build infrastructure and core services, wire up the code indexing pipeline end-to-end with one model, add the query path, extend to multi-model routing (text and images), and finish with status reporting and polish. The critical path runs through the validation spike -- if Zvec or WebGPU fail, alternatives must be swapped before any pipeline work begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Validation Spike** - Confirm Zvec and WebGPU work on target system before building on them
- [x] **Phase 2: Foundation and Infrastructure** - Project structure, CLI scaffold, ignore parsing, model loader, vector DB wrapper
- [x] **Phase 3: Code Indexing Pipeline** - End-to-end indexing with Jina code model, chunking, batching, incremental caching
- [x] **Phase 4: Search and Query** - Natural language query with ranked, machine-readable results
- [ ] **Phase 5: Multi-Model Routing** - Extend to text (Nomic) and image (CLIP) models with auto-detection
- [ ] **Phase 6: Status and Polish** - Status command, error handling, edge cases

## Phase Details

### Phase 1: Validation Spike
**Goal**: Risky dependencies are confirmed working on NixOS, or fallbacks are identified and committed to
**Depends on**: Nothing (first phase)
**Requirements**: VALID-01, VALID-02
**Success Criteria** (what must be TRUE):
  1. Zvec Node.js SDK can create a collection, insert vectors, query by similarity, and delete entries on NixOS
  2. Transformers.js v4 can load a model and produce embeddings, with WebGPU attempted and WASM/CPU fallback confirmed working
  3. If either dependency fails, a concrete alternative is documented (LanceDB for Zvec, CPU-only for WebGPU) with a working proof
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md -- Zvec CRUD validation at realistic scale (1000+ vectors, 768 dims)
- [x] 01-02-PLAN.md -- Transformers.js WebGPU/CPU inference with embedding quality validation

### Phase 2: Foundation and Infrastructure
**Goal**: All infrastructure modules exist and are independently testable -- the project skeleton is ready for pipeline integration
**Depends on**: Phase 1
**Requirements**: IDX-05, IDX-08, INFRA-01, INFRA-02, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. Running `ez-search --help` completes in under 200ms (lazy loading works, no models loaded)
  2. `~/.ez-search/<project>-<hash>/` directory is created in user home with separate vector collections for 768-dim and 512-dim models
  3. File scanner respects .gitignore and .cursorignore rules, and `--no-ignore` flag disables exclusion
  4. Model router loads the correct model on first use and falls back gracefully from WebGPU to WASM/CPU
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md -- Project scaffold, types, path utilities, and CLI skeleton with lazy loading
- [x] 02-02-PLAN.md -- File scanner with ignore parsing and type classification
- [x] 02-03-PLAN.md -- Vector DB wrapper and model router services

### Phase 3: Code Indexing Pipeline
**Goal**: User can index a codebase and see it stored as searchable vector embeddings with incremental caching
**Depends on**: Phase 2
**Requirements**: IDX-01, IDX-04, IDX-06, IDX-07, INFRA-03, INFRA-06
**Success Criteria** (what must be TRUE):
  1. Running `ez-search index .` on a TypeScript project scans code files, chunks them, generates embeddings via Jina model, and stores them in Zvec
  2. Running `ez-search index .` a second time with no file changes completes near-instantly (incremental caching via mtime/size + xxhash)
  3. Running `ez-search index . --type code` forces the code pipeline regardless of file types present
  4. Running `ez-search index . --clear` removes existing index data before re-indexing
  5. Batch inference processes chunks in groups of 32 without VRAM OOM on a standard GPU
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md -- Manifest cache, incremental change detection, and foundation updates (types, scanner, vector-db schema v2)
- [x] 03-02-PLAN.md -- Token-accurate code chunking with line number tracking
- [x] 03-03-PLAN.md -- Index command wiring: scanner to chunker to embedder to store

### Phase 4: Search and Query
**Goal**: User can search their indexed codebase with natural language and get useful, machine-parseable results
**Depends on**: Phase 3
**Requirements**: SRCH-01, SRCH-03, SRCH-04, SRCH-05
**Success Criteria** (what must be TRUE):
  1. Running `ez-search query "how does authentication work"` returns ranked code snippets with file paths, line ranges, and relevance scores
  2. Output follows the machine-readable format: `File: <path> | Lines: <start>-<end> | Relevance: <score>`
  3. `--top-k 5` limits results to 5 entries; default is 10
  4. `--dir ./src` scopes the search to the specified subdirectory
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md -- Full query pipeline: embed query, vector search, score normalization, chunk collapsing, JSON/text output, all flags (--top-k, --dir, --threshold, --format)

### Phase 5: Multi-Model Routing
**Goal**: User can index and search text documents and images alongside code, with automatic file type detection
**Depends on**: Phase 4
**Requirements**: IDX-02, IDX-03, SRCH-02
**Success Criteria** (what must be TRUE):
  1. Running `ez-search index .` on a directory with .md, .txt, and .pdf files indexes them using the Nomic text model
  2. Running `ez-search index .` on a directory with .jpg, .png, and .webp files indexes them using the CLIP model
  3. File type is auto-detected by extension; code, text, and image files are routed to their respective models without user flags
  4. Query auto-detects which collections have data and searches across all indexed types
**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md -- Text chunker service with paragraph-boundary splitting and PDF extraction
- [ ] 05-02-PLAN.md -- CLIP image embedding service with fp32 vision model
- [ ] 05-03-PLAN.md -- Auto-detection routing: multi-type index and grouped multi-collection query

### Phase 6: Status and Polish
**Goal**: User has visibility into their index state and the tool handles edge cases gracefully
**Depends on**: Phase 5
**Requirements**: STAT-01
**Success Criteria** (what must be TRUE):
  1. Running `ez-search status` shows file count, last indexed timestamp, active model types, and index size on disk
  2. All commands produce clear error messages for common failures (no index found, empty directory, unsupported file type)
**Plans**: TBD

Plans:
- [ ] 06-01: Status command and error handling polish

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Validation Spike | 2/2 | Complete | 2026-02-23 |
| 2. Foundation and Infrastructure | 3/3 | Complete | 2026-02-22 |
| 3. Code Indexing Pipeline | 3/3 | Complete | 2026-02-22 |
| 4. Search and Query | 1/1 | Complete | 2026-02-22 |
| 5. Multi-Model Routing | 0/3 | Not started | - |
| 6. Status and Polish | 0/1 | Not started | - |
