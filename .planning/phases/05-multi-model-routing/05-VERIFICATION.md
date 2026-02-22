---
phase: 05-multi-model-routing
verified: 2026-02-23T13:47:33Z
status: gaps_found
score: 3/4 must-haves verified
gaps:
  - truth: "Query auto-detects which collections have data and searches across all indexed types"
    status: partial
    reason: "Query always loads both Jina and Nomic models regardless of whether data of each type was indexed. The manifest is read (line 38-39 of query-cmd.ts) but only to count totalIndexed — it is not inspected to detect which file types are present and skip unnecessary model loads. The search does return grouped results from both types, but it loads both models unconditionally."
    artifacts:
      - path: "src/cli/commands/query-cmd.ts"
        issue: "typesToQuery defaults to ['code', 'text'] always (line 44-45). No check against manifest to see whether code or text files were actually indexed before loading each model."
    missing:
      - "Pre-check manifest entries by extension (via EXTENSION_MAP) to determine which types have indexed data"
      - "Skip loading Jina pipeline if no code files are in manifest"
      - "Skip loading Nomic pipeline if no text files are in manifest"
---

# Phase 5: Multi-Model Routing Verification Report

**Phase Goal:** User can index and search text documents and images alongside code, with automatic file type detection
**Verified:** 2026-02-23T13:47:33Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `.md`, `.txt`, `.pdf` files indexed using Nomic text model | VERIFIED | `EXTENSION_MAP` maps `.md`, `.txt`, `.pdf` to `'text'` (types.ts:47-51). `runTextEmbeddingPipeline()` called with `type: 'text'` uses Nomic (`nomic-ai/nomic-embed-text-v1.5`) with `search_document: ` prefix (index-cmd.ts:265-268). PDF files route through `extractPdfText()` then `chunkTextFile()` (index-cmd.ts:127-129). |
| 2 | `.jpg`, `.png`, `.webp` files indexed using CLIP model | VERIFIED | `EXTENSION_MAP` maps `.jpg`, `.jpeg`, `.png`, `.webp` to `'image'` (types.ts:58-62). Image pipeline uses `createImageEmbeddingPipeline()` from `image-embedder.ts` backed by `Xenova/clip-vit-base-patch32` producing 512-dim vectors inserted into col-512 (index-cmd.ts:461-492). |
| 3 | File type auto-detected by extension; routing without user flags | VERIFIED | When `--type` is omitted, `typesToIndex` defaults to `['code', 'text', 'image']` (index-cmd.ts:337-339). `scanFiles()` is called per type using `EXTENSION_MAP` to classify by extension (file-scanner.ts:64-72). Each type is routed to its respective model and collection automatically. |
| 4 | Query auto-detects which collections have data and searches across all indexed types | PARTIAL | Query does search code+text and return grouped output (`{ code: [...], text: [...] }`). However, it always loads both Jina and Nomic models regardless of what's actually indexed — it does not inspect the manifest to detect which types have data before loading each model. `typesToQuery` defaults to `['code', 'text']` unconditionally (query-cmd.ts:43-45). |

**Score:** 3/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types.ts` | EXTENSION_MAP with text (.md, .txt, .pdf) and image (.jpg, .png, .webp) extensions | VERIFIED | All required extensions present (lines 47-63). 165 lines, fully substantive. |
| `src/services/text-chunker.ts` | Paragraph-boundary chunking, PDF extraction | VERIFIED | 164 lines. `chunkTextFile()` exported (line 111), `extractPdfText()` exported (line 86). Both imported by index-cmd.ts. |
| `src/services/image-embedder.ts` | CLIP ViT-B/32 fp32 pipeline, one vector per image | VERIFIED | 94 lines. `createImageEmbeddingPipeline()` exported (line 51). Uses `CLIPVisionModelWithProjection` with `dtype: 'fp32'`. Imported by index-cmd.ts. |
| `src/services/model-router.ts` | Nomic model registered for 'text' type | VERIFIED | `nomic-ai/nomic-embed-text-v1.5` registered in `MODEL_REGISTRY` (line 27). `createEmbeddingPipeline('text')` routes to Nomic. |
| `src/cli/commands/index-cmd.ts` | Multi-type routing: code/text/image pipeline | VERIFIED | 560 lines. Full rewrite with `runTextEmbeddingPipeline()` shared helper, image pipeline via `createImageEmbeddingPipeline()`, per-type deletion scoping, `typesToIndex = ['code', 'text', 'image']` default. |
| `src/cli/commands/query-cmd.ts` | Multi-collection grouped search (code+text), grouped JSON output | PARTIAL | 278 lines. Searches code (Jina) and text (Nomic) with grouped `{ code, text }` JSON output. Does NOT pre-detect which types have indexed data; always loads both models. |
| `src/cli/index.ts` | `--type` option on query command | VERIFIED | `--type <type>` option added to query command definition (line 31). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index-cmd.ts` | `text-chunker.ts` | `import('../../services/text-chunker.js')` | WIRED | Called at lines 127 and 223 for PDF and non-PDF text files respectively |
| `index-cmd.ts` | `image-embedder.ts` | `import('../../services/image-embedder.js')` | WIRED | Called at line 461 for image file pipeline |
| `index-cmd.ts` | `model-router.ts` | `createEmbeddingPipeline(type)` | WIRED | Called at line 265 inside `runTextEmbeddingPipeline()` with `type` param ('code' or 'text') |
| `query-cmd.ts` | `model-router.ts` (Nomic) | `createEmbeddingPipeline('text')` | WIRED | Called at line 186; prefixes query with `search_query: ` (line 187) |
| `query-cmd.ts` | `model-router.ts` (Jina) | `createEmbeddingPipeline('code')` | WIRED | Called at line 163 |
| `query-cmd.ts` | manifest | `loadManifest()` | PARTIAL | Manifest loaded but only for `totalIndexed` count; not used to skip model loads for empty collections |
| `file-scanner.ts` | `EXTENSION_MAP` | `EXTENSION_MAP[ext]` | WIRED | Extensions looked up at line 64; typeFilter applied at line 72 |
| `index-cmd.ts` | `col512` (CLIP) | `col512.insert(chunkId, embedding, ...)` | WIRED | Image embeddings inserted into 512-dim collection at line 471 |
| `index-cmd.ts` | `col768` (Nomic) | `col768.insert(chunk.chunkId, embeddings[i], ...)` | WIRED | Text embeddings inserted into 768-dim col with `modelId: pipe.modelId` at line 277 |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| IDX-02: Index text/document files (.md, .txt, .pdf) using Nomic | SATISFIED | EXTENSION_MAP classifies, index-cmd routes to Nomic via `runTextEmbeddingPipeline(type='text')` |
| IDX-03: Index image files (.jpg, .png, .webp) using CLIP | SATISFIED | EXTENSION_MAP classifies, image pipeline in index-cmd uses `createImageEmbeddingPipeline()` (CLIP ViT-B/32 fp32) |
| SRCH-02: Auto-detect which model pipeline to use based on indexed content | PARTIAL | Index auto-routes by extension. Query searches code+text and returns grouped results, but does not inspect manifest to skip loading models for types with no indexed data. |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/services/image-embedder.ts` line 6 | "ConvInteger(10) is not implemented" | Info | This is a comment documenting a known onnxruntime-node limitation, not a TODO or placeholder. No functional impact. |

No blocker anti-patterns found. No placeholder implementations. No empty handlers. No stub returns.

### Human Verification Required

#### 1. PDF Extraction Runtime

**Test:** Place a real PDF file in a directory and run `ez-search index .`
**Expected:** PDF text is extracted and indexed without error; chunks appear in query results
**Why human:** `pdf-parse` is imported dynamically at runtime. Cannot verify the `PDFParse` import path (`pdf-parse` exports `PDFParse` class) is correct without running it. The import uses `{ PDFParse }` named export which may differ from the package's actual API depending on version.

#### 2. CLIP Model Load (fp32 requirement)

**Test:** Place a `.jpg`, `.png`, or `.webp` file in a directory and run `ez-search index .`
**Expected:** Image is embedded without the "ConvInteger(10) is not implemented" error; model loads with fp32 dtype
**Why human:** Cannot verify the runtime ONNX model load succeeds programmatically. The `dtype: 'fp32'` constraint is documented and correct but requires actual GPU/CPU inference to confirm.

#### 3. Nomic prefix correctness end-to-end

**Test:** Index `.md` files, then run `ez-search query "some query text"` and inspect results
**Expected:** Text results appear in the `text` section of grouped output with meaningful relevance scores
**Why human:** The `search_document: ` prefix on index and `search_query: ` prefix on query are correctly placed in code, but end-to-end embedding quality with Nomic requires a live model run to confirm.

### Gaps Summary

**Gap: Query does not pre-detect indexed types from manifest**

The query command defaults `typesToQuery = ['code', 'text']` (query-cmd.ts:43-45) and always loads both Jina and Nomic models sequentially. It does not inspect the manifest to determine which file types are actually indexed before loading each model pipeline.

The success criterion states: "Query auto-detects which collections have data and searches across all indexed types." The functional result is correct — the grouped output only includes types with actual results — but the *auto-detection* mechanism is missing. If only code files were indexed, the query still loads Nomic, queries col-768, gets nomic-filtered results (none), and produces output with only a `code` key. The detection is implicit (empty results filtered out) rather than explicit (check manifest first, skip unneeded model).

This is classified as **partial** rather than failed because:
- The grouped search output is correct in all cases
- Types without data produce empty result sets that are correctly excluded from output
- The functional goal (search across indexed types) is achieved

However, the criterion's wording ("auto-detects which collections have data") implies the system should know what's indexed before searching, not discover it through empty results. This gap could matter for performance (loading a large model unnecessarily) and for future image query support.

---
*Verified: 2026-02-23T13:47:33Z*
*Verifier: Claude (gsd-verifier)*
