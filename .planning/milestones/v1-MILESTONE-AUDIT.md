---
milestone: v1
audited: 2026-02-23T17:30:00Z
status: tech_debt
scores:
  requirements: 22/22
  phases: 8/8
  integration: 14/14
  flows: 11/12
tech_debt:
  - phase: 05-multi-model-routing
    items:
      - "Image query returns UNSUPPORTED_TYPE — col-512 data is indexed but unreachable via query (v2 ASRCH-02)"
  - phase: 08-project-scoped-storage
    items:
      - "clearManifest export is dead — rmSync replaces it in --clear path but export remains"
  - phase: general
    items:
      - "Edge case: `ez-search query --type code` on unindexed project returns 0 results instead of NO_INDEX error (--type bypasses pre-detection guard)"
---

# v1 Milestone Audit Report

**Audited:** 2026-02-23 (post Phase 7+8)
**Status:** tech_debt (no critical blockers; minor accumulated debt)

## Requirements Coverage

| Requirement | Description | Phase | Status |
|-------------|-------------|-------|--------|
| VALID-01 | Zvec CRUD on target system | 1 | SATISFIED |
| VALID-02 | WebGPU/CPU inference with Transformers.js | 1 | SATISFIED |
| IDX-01 | Index code files with Jina model | 3 | SATISFIED |
| IDX-02 | Index text/document files with Nomic model | 5 | SATISFIED |
| IDX-03 | Index image files with CLIP model | 5 | SATISFIED |
| IDX-04 | Incremental indexing (mtime/size + xxhash) | 3 | SATISFIED |
| IDX-05 | Index state in `<project>/.ez-search/` | 8 | SATISFIED |
| IDX-06 | Force pipeline with --type flag | 3 | SATISFIED |
| IDX-07 | Clear index with --clear flag | 3 | SATISFIED |
| IDX-08 | Separate vector collections (768-dim, 512-dim) | 2 | SATISFIED |
| SRCH-01 | Query with natural language, ranked results | 4 | SATISFIED |
| SRCH-02 | Auto-detect model pipeline based on indexed content | 7 | SATISFIED |
| SRCH-03 | Machine-readable output format | 4 | SATISFIED |
| SRCH-04 | --top-k flag (default 10) | 4 | SATISFIED |
| SRCH-05 | --dir flag for scoping | 4 | SATISFIED |
| INFRA-01 | WebGPU with graceful CPU fallback | 2 | SATISFIED |
| INFRA-02 | Lazy model loading (cold start <1.5s) | 2 | SATISFIED |
| INFRA-03 | Batch inference (batches of 32) | 3 | SATISFIED |
| INFRA-04 | Respect .gitignore and .cursorignore | 2 | SATISFIED |
| INFRA-05 | --no-ignore flag to disable exclusion | 2 | SATISFIED |
| INFRA-06 | Text/code chunking (~500 tokens, 50 overlap) | 3 | SATISFIED |
| STAT-01 | Status command with index info | 6 | SATISFIED |

**Score:** 22/22 requirements satisfied

## Phase Verification Summary

| Phase | Status | Score | Key Finding |
|-------|--------|-------|-------------|
| 1. Validation Spike | PASSED | 3/3 | Both dependencies confirmed working on NixOS |
| 2. Foundation & Infrastructure | PASSED | 4/4 | Storage path gap resolved by Phase 8 |
| 3. Code Indexing Pipeline | PASSED | 5/5 | Full pipeline with incremental caching |
| 4. Search and Query | PASSED | 8/8 | Complete query pipeline with all flags |
| 5. Multi-Model Routing | GAPS_FOUND | 3/4 | Gap closed by Phase 7 (manifest pre-detection) |
| 6. Status and Polish | GAPS_FOUND | 1.5/2 | Gap closed by Phase 7 (EMPTY_DIR wiring) |
| 7. Gap Closure | PASSED | 2/2 | Closed all gaps from phases 5+6 |
| 8. Project-Scoped Storage | PASSED | 8/8 | All consumers updated to project-local paths |

**Score:** 8/8 phases complete (gaps from phases 5+6 closed by phase 7)

## Cross-Phase Integration

| Connection | Status | Details |
|------------|--------|---------|
| CLI → index-cmd (lazy load) | WIRED | Dynamic import in action handler |
| CLI → query-cmd (lazy load) | WIRED | Dynamic import in action handler |
| CLI → status-cmd (lazy load) | WIRED | Dynamic import in action handler |
| index-cmd → file-scanner | WIRED | scanFiles() with typeFilter per type |
| index-cmd → chunker (code) | WIRED | loadTokenizer + chunkFile |
| index-cmd → text-chunker | WIRED | chunkTextFile + extractPdfText |
| index-cmd → image-embedder | WIRED | createImageEmbeddingPipeline (CLIP) |
| index-cmd → model-router | WIRED | createEmbeddingPipeline('code'/'text') |
| index-cmd → vector-db | WIRED | col768.insert + col512.insert |
| index-cmd → manifest-cache | WIRED | loadManifest/saveManifest |
| query-cmd → manifest pre-detect | WIRED | EXTENSION_MAP scan of manifest keys → typesToQuery |
| query-cmd → model-router | WIRED | Conditional Jina + Nomic pipelines |
| query-cmd → vector-db (col-768) | WIRED | col768.query with modelId filter |
| status-cmd → manifest-cache | WIRED | loadManifest + resolveProjectStoragePath |

**Score:** 14/14 connections wired

## E2E Flow Verification

| Flow | Status | Details |
|------|--------|---------|
| 1. Code indexing | COMPLETE | scan → chunk (Jina tokenizer) → embed (Jina) → col768 → manifest |
| 2. Text indexing | COMPLETE | scan → chunk (paragraph) → embed (Nomic, "search_document:") → col768 → manifest |
| 3. Image indexing | COMPLETE | scan → embed (CLIP fp32) → col512 → manifest |
| 4. Multi-type indexing | COMPLETE | Auto-routes code/text/image by extension |
| 5. Incremental re-index | COMPLETE | mtime+size fast path → hash fallback → chunk-level textHash dedup |
| 6. Code query | COMPLETE | manifest pre-detect → Jina embed → col768.query → normalize → collapse → output |
| 7. Text query | COMPLETE | manifest pre-detect → Nomic embed ("search_query:") → col768.query → normalize → collapse → output |
| 8. Cross-type query | COMPLETE | Both types queried → grouped JSON output |
| 9. Status | COMPLETE | manifest → per-type counts → disk size → staleness |
| 10. Error flows | COMPLETE | EMPTY_DIR, NO_INDEX, UNSUPPORTED_TYPE, CORRUPT_MANIFEST all wired |
| 11. Clear and re-index | COMPLETE | rmSync(.ez-search/) → fresh collections → manifest reset |
| 12. Image query (text input) | BROKEN (intentional) | UNSUPPORTED_TYPE — deferred to v2 ASRCH-02 |

**Score:** 11/12 flows complete (1 intentional architectural deferral)

## Tech Debt Inventory

### Phase 5: Multi-Model Routing
- Image query returns UNSUPPORTED_TYPE — col-512 data is indexed but unreachable via query command. This is the correct v1 behavior; image-to-image search is a v2 requirement (ASRCH-02).

### Phase 8: Project-Scoped Storage
- `clearManifest` is exported from `manifest-cache.ts` but never imported by any module. The `--clear` path now uses `rmSync` on the entire `.ez-search/` directory, making this function dead code.

### General
- Edge case: `ez-search query --type code` on an unindexed project returns 0 results instead of a NO_INDEX error, because the `--type` flag bypasses the manifest pre-detection guard. Minor UX inconsistency.

**Total:** 3 items (down from 7 in previous audit — Phases 7+8 resolved 4)

## Gaps Closed Since Previous Audit

| Item | Closed By | Details |
|------|-----------|---------|
| SRCH-02 partial (implicit detection) | Phase 7 | Manifest pre-detection now skips unnecessary model loads |
| EMPTY_DIR never emitted | Phase 7 | Wired at index-cmd.ts lines 491-498 |
| CollectionName dead export | Phase 7 | Removed from types.ts |
| @inquirer/prompts dead dependency | Phase 7 | Removed from package.json |
| cli-progress dead dependency | Phase 7 | Removed from package.json |
| ScannedFile type shadow | Phase 7 | Local type removed, canonical import used |
| IDX-05 storage path conflict | Phase 8 | Moved from ~/.ez-search/<hash>/ to <project>/.ez-search/ |

## Assessment

All 22 v1 requirements are satisfied. All 8 phases verified. Cross-phase integration is fully wired. 11 of 12 E2E flows work correctly; the one broken flow (image query from text) is an intentional v2 deferral.

The remaining tech debt (3 items) is minor — a dead export, an edge-case UX inconsistency, and an architectural limitation that maps to a v2 requirement. No critical blockers exist.

The tool delivers its core value: local semantic search over code and text with zero cloud dependencies, fast enough for AI assistant consumption.

---
*Audited: 2026-02-23 (post Phase 7+8)*
*Auditor: Claude (gsd-audit-milestone)*
