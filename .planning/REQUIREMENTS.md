# Requirements: ez-search

**Defined:** 2026-02-22
**Core Value:** Developers can semantically search their codebase locally with zero cloud dependencies — fast enough to be useful as a retrieval engine for AI assistants.

## v1 Requirements

### Validation

- [ ] **VALID-01**: Zvec Node.js SDK installs and runs basic CRUD operations on target system
- [ ] **VALID-02**: WebGPU inference works via Transformers.js v4 on target system, with fallback to WASM/CPU confirmed

### Indexing

- [ ] **IDX-01**: User can index a directory of code files (.ts, .js, .py, .go, .rs, .c, .cpp) into vector embeddings using Jina code model
- [ ] **IDX-02**: User can index text/document files (.md, .txt, .pdf, .csv) using Nomic text model
- [ ] **IDX-03**: User can index image files (.jpg, .png, .webp) using CLIP model
- [ ] **IDX-04**: Incremental indexing skips unchanged files using mtime/size check + xxhash content verification
- [ ] **IDX-05**: All index state stored in `.ez-search/` hidden directory at index root
- [ ] **IDX-06**: User can force a specific pipeline with `--type <code|text|image>` flag
- [ ] **IDX-07**: User can clear existing index with `--clear` flag
- [ ] **IDX-08**: Separate vector collections per model type (768-dim for code/text, 512-dim for images)

### Search

- [ ] **SRCH-01**: User can query indexed embeddings with natural language and get ranked results
- [ ] **SRCH-02**: Auto-detect which model pipeline to use based on indexed content types
- [ ] **SRCH-03**: Machine-readable output format: `File: <path> | Lines: <start>-<end> | Relevance: <score>`
- [ ] **SRCH-04**: User can control number of results with `--top-k` flag (default 10)
- [ ] **SRCH-05**: User can target a specific directory with `--dir` flag (default `.`)

### Infrastructure

- [ ] **INFRA-01**: WebGPU inference with graceful fallback to WASM/CPU when GPU unavailable
- [ ] **INFRA-02**: Lazy model loading — models loaded only after command is parsed (cold start <1.5s)
- [ ] **INFRA-03**: Batch WebGPU inference in batches of 32 to avoid VRAM OOM
- [ ] **INFRA-04**: Respect .gitignore and .cursorignore for file exclusion during indexing
- [ ] **INFRA-05**: User can disable ignore file exclusion with a flag (e.g., `--no-ignore`)
- [ ] **INFRA-06**: Text/code chunking with ~500 token chunks and 50 token overlap, tracking start/end line numbers

### Status

- [ ] **STAT-01**: User can run `ez-search status` to see index info (file count, last indexed, model types, size)

## v2 Requirements

### MCP Integration

- **MCP-01**: Expose ez-search as an MCP server tool for direct AI assistant integration
- **MCP-02**: AI assistants can discover and call ez-search query via MCP protocol

### Advanced Search

- **ASRCH-01**: Hybrid search combining semantic similarity with keyword/BM25 matching
- **ASRCH-02**: Image-to-image search (query with an image path instead of text)

### Quality

- **QUAL-01**: AST-aware code chunking via tree-sitter for better code search relevance
- **QUAL-02**: Watch mode for automatic re-indexing when files change

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud/remote vector databases | Defeats the privacy-first purpose |
| GUI or web interface | CLI-only tool |
| Model fine-tuning or training | Uses pre-trained ONNX models |
| Multi-directory unified search | Each directory has its own index |
| Bundled LLM/answer generation | Primary consumer (AI assistants) already has reasoning capability |
| OAuth/authentication | Local tool, no auth needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VALID-01 | Phase 1 | Pending |
| VALID-02 | Phase 1 | Pending |
| IDX-01 | Phase 3 | Pending |
| IDX-02 | Phase 5 | Pending |
| IDX-03 | Phase 5 | Pending |
| IDX-04 | Phase 3 | Pending |
| IDX-05 | Phase 2 | Pending |
| IDX-06 | Phase 3 | Pending |
| IDX-07 | Phase 3 | Pending |
| IDX-08 | Phase 2 | Pending |
| SRCH-01 | Phase 4 | Pending |
| SRCH-02 | Phase 5 | Pending |
| SRCH-03 | Phase 4 | Pending |
| SRCH-04 | Phase 4 | Pending |
| SRCH-05 | Phase 4 | Pending |
| INFRA-01 | Phase 2 | Pending |
| INFRA-02 | Phase 2 | Pending |
| INFRA-03 | Phase 3 | Pending |
| INFRA-04 | Phase 2 | Pending |
| INFRA-05 | Phase 2 | Pending |
| INFRA-06 | Phase 3 | Pending |
| STAT-01 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after initial definition*
