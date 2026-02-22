# Phase 5: Multi-Model Routing - Research

**Researched:** 2026-02-22
**Domain:** Nomic text embedding, CLIP image embedding, PDF extraction, text chunking, multi-type query routing
**Confidence:** HIGH for text pipeline; MEDIUM for image pipeline (CLIP dtype compatibility requires careful choice); HIGH for routing logic

## Summary

Phase 5 extends the existing code pipeline (Jina, 768-dim, col-768) to support text documents (Nomic, 768-dim, col-768) and images (CLIP, 512-dim, col-512). The infrastructure is already in place: `col768` and `col512` collections both exist, `EXTENSION_MAP` already classifies `.md/.txt/.jpg/.png/etc.`, and `model-router.ts` already has the Nomic model registered. The three tasks are: implement the text pipeline, implement the image pipeline, and implement auto-detection routing in both index and query commands.

The text pipeline is straightforward — Nomic uses the same 768-dim `col-768` collection as Jina code, requires task prefixes (`search_document:` for indexing, `search_query:` for querying), and uses the same `{ pooling: 'mean', normalize: true }` options. Chunking strategy for text differs from code: prefer paragraph-level splits rather than token-window slicing, since Nomic was trained on natural language paragraphs.

The image pipeline has a critical constraint: **quantized vision models (int8, uint8) fail in Node.js with `onnxruntime-node`** because the `ConvInteger(10)` operator is not implemented. Use `dtype: 'fp32'` for the CLIP vision model. Images are embedded as whole units (no chunking) using `CLIPVisionModelWithProjection` from `@huggingface/transformers`. Model ID: `Xenova/clip-vit-base-patch32` (512-dim). `RawImage.fromURL()` accepts local file paths in Node.js.

PDF text extraction uses `pdf-parse` (no native deps, pure JS, wide adoption) — read the file into a Buffer, call `pdf(buffer)`, get `result.text`.

**Primary recommendation:** Text pipeline — Nomic with `search_document:` prefix, paragraph chunking at ~400 tokens. Image pipeline — `CLIPVisionModelWithProjection` with `dtype: 'fp32'`, one vector per image, store `absolutePath` in metadata. Query routing — detect populated collections, query each, merge into grouped envelope.

## Standard Stack

No new model libraries needed. `@huggingface/transformers` already installed and used. One new dependency for PDF: `pdf-parse`.

### Core (all already installed except pdf-parse)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@huggingface/transformers` | 4.0.0-next.4 | Nomic text embedding + CLIP image embedding | Already installed; model-router.ts already has Nomic registered |
| `@zvec/zvec` | 0.2.0 | Vector storage — col-768 (text, 768-dim) + col-512 (image, 512-dim) | Already installed; both collections already open |
| `pdf-parse` | 1.x | PDF text extraction from Buffer | Pure JS, no native deps, 767+ projects use it, works in Node.js |

### Supporting (NOT needed)
| Do Not Use | Why |
|------------|-----|
| `sharp` | `RawImage` uses sharp internally via transformers.js; no need to add it separately |
| `canvas` | Not needed; `RawImage.fromURL()` handles local file loading natively in Node.js |
| Any semantic chunking library | Paragraph-boundary splitting is simple enough to implement inline |

**Installation:**
```bash
npm install pdf-parse
```

## Architecture Patterns

### Recommended File Structure (new/changed files for Phase 5)

```
src/
├── cli/
│   └── commands/
│       ├── index-cmd.ts         # MODIFY — remove early-exit stubs; add text/image branches
│       └── query-cmd.ts         # MODIFY — query all populated collections, grouped output
├── services/
│   ├── model-router.ts          # MODIFY — add 'image' model type, CLIPVisionModelWithProjection
│   ├── chunker.ts               # MODIFY — add chunkText() for paragraph-based text splitting
│   └── file-scanner.ts          # READ ONLY — already routes .md/.txt/.jpg/.png correctly
└── types.ts                     # READ ONLY — FileType 'text'/'image' already declared
```

### Pattern 1: Nomic Text Embedding (text pipeline)

**What:** Same `feature-extraction` pipeline pattern as Jina code, but with Nomic model and mandatory task prefix.

**Critical detail:** Prefix every document string with `"search_document: "` before passing to `pipe.embed()`. Prefix query strings with `"search_query: "` before embedding at query time. The pipeline does NOT add these automatically.

**Pooling and normalization:** Use `{ pooling: 'mean', normalize: true }` — same as Jina code. The Nomic model card and `model-router.ts` comments confirm this.

**Example — adding to model-router.ts:**
```typescript
// Source: model-router.ts already has this. No change needed to MODEL_REGISTRY for text.
// The 'text' model is already registered:
// text: { id: 'nomic-ai/nomic-embed-text-v1.5', dim: 768, taskPrefix: { document: 'search_document: ', query: 'search_query: ' } }

// In index-cmd.ts text branch:
const texts = batch.map((c) => `search_document: ${c.text}`);
const embeddings = await pipe.embed(texts);

// In query-cmd.ts when querying text collection:
const [queryEmbedding] = await nomicPipe.embed([`search_query: ${queryText}`]);
```

**Example — createEmbeddingPipeline for text:**
```typescript
// Source: src/services/model-router.ts — already supports 'text' as a ModelType
const pipe = await createEmbeddingPipeline('text');
// pipe.embed() works the same way as 'code' — caller must add prefix to inputs
```

**Storage:** Text chunks go into `col-768` (same collection as code). The `modelId` metadata field distinguishes them: `'jinaai/jina-embeddings-v2-base-code'` for code, `'nomic-ai/nomic-embed-text-v1.5'` for text.

### Pattern 2: CLIP Image Embedding (image pipeline)

**What:** Load `CLIPVisionModelWithProjection` from `Xenova/clip-vit-base-patch32`. Load `AutoProcessor`. Read image with `RawImage.fromURL(absolutePath)`. Process with processor, run through vision model, extract `image_embeds` tensor (512-dim Float32Array). Store one vector per image file.

**Critical constraint:** Use `dtype: 'fp32'` — quantized variants (q8, int8, uint8) fail in Node.js with `onnxruntime-node` due to missing `ConvInteger(10)` operator. This is a known issue confirmed in the HuggingFace discussion for clip-vit-base-patch32. fp32 is larger (~350MB download) but works correctly.

**No chunking:** Images are not split into chunks. One image = one vector. The `chunkIndex` metadata field should be 0, and `lineStart`/`lineEnd` fields are not meaningful (store 0 or omit).

**Model loading pattern (to add to model-router.ts):**
```typescript
// Source: transformers.js docs + Xenova/clip-vit-base-patch32 hub page
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';

// Use same cache dir as text/code models
env.cacheDir = resolveModelCachePath();
env.allowRemoteModels = true;

const processor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32');
const visionModel = await CLIPVisionModelWithProjection.from_pretrained(
  'Xenova/clip-vit-base-patch32',
  { dtype: 'fp32', device: 'cpu' }
);

// Load image from local file path (RawImage.fromURL accepts file paths in Node.js)
const image = await RawImage.fromURL(absoluteFilePath);
const inputs = await processor(image);
const { image_embeds } = await visionModel(inputs);
// image_embeds: Tensor { dims: [1, 512], type: 'float32', data: Float32Array(512) }

const embedding = new Float32Array(image_embeds.data); // 512-dim
```

**Storage:** Image vectors go into `col-512`. Metadata fields: `filePath` (relative path), `chunkIndex: 0`, `modelId: 'Xenova/clip-vit-base-patch32'`, `lineStart: 0`, `lineEnd: 0`, `chunkText: ''` (images have no text content).

**No processor singleton:** Unlike the code tokenizer singleton, the CLIP processor+model are loaded once per indexing session and reused across all images in the batch. Load lazily (on first image file encountered).

### Pattern 3: PDF Text Extraction

**What:** Use `pdf-parse` to extract raw text from PDF files before chunking.

**API:**
```typescript
// Source: pdf-parse npm package
import pdfParse from 'pdf-parse';
import { readFile } from 'fs/promises';

const buffer = await readFile(absoluteFilePath);
const result = await pdfParse(buffer);
const text: string = result.text; // full plain text, all pages concatenated
```

**Notes:**
- No OCR: `pdf-parse` works only on text-layer PDFs (searchable PDFs). Scanned image PDFs return empty text. This is acceptable for Phase 5 — document that limitation.
- `result.numpages` gives page count if needed for logging.
- The `text` field concatenates all pages with newlines.

### Pattern 4: Text Chunking Strategy (for Nomic)

**What:** Paragraph-boundary chunking, not token-window sliding (which the code pipeline uses). Split on double newlines (`\n\n`) first, then merge small paragraphs up to ~400 tokens.

**Why different from code:** Nomic was trained on natural language paragraphs. Token-window sliding across arbitrary boundaries degrades retrieval quality. Markdown headers create natural section boundaries.

**Recommended approach — simple paragraph split:**
```typescript
// Source: designed from RAG chunking research 2025 + Nomic model characteristics
// Claude's Discretion area per CONTEXT.md

const TEXT_CHUNK_SIZE = 400;   // tokens, approximate (use character estimate)
const CHARS_PER_TOKEN = 4;     // rough estimate for English text
const MAX_CHARS = TEXT_CHUNK_SIZE * CHARS_PER_TOKEN; // ~1600 chars

function chunkTextFile(text: string): Array<{ text: string; index: number }> {
  // Split on paragraph breaks (double newline) — respects Markdown section boundaries
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);

  const chunks: Array<{ text: string; index: number }> = [];
  let current = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHARS && current.length > 0) {
      chunks.push({ text: current.trim(), index: chunkIndex++ });
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }

  if (current.trim()) {
    chunks.push({ text: current.trim(), index: chunkIndex });
  }

  return chunks;
}
```

**Text chunk IDs:** Use the same `makeChunkId(relPath, chunkIndex)` from `manifest-cache.ts`. No conflict risk because code and text files have distinct extensions and paths.

**Text chunk metadata:** Use same Zvec schema as code chunks — `filePath`, `chunkIndex`, `modelId`, `lineStart: 0`, `lineEnd: 0` (not meaningful for text), `chunkText`. Line tracking is not needed for text documents; AI agents will use `chunkText` directly.

### Pattern 5: Multi-Type Query Routing

**What:** Query all populated collections, gather results from each, merge into a grouped envelope.

**Collection population detection:** The manifest tracks indexed files per type implicitly via file extension. A simpler approach: query each collection with the embedding and catch empty results. Or check the manifest for any entries where the file extension maps to that type.

**Recommended approach:** Query all three potential pipeline collections, ignore empty results:
```typescript
// Source: designed from CONTEXT.md decisions 2026-02-22

// For each active type, embed the query with the correct model+prefix and query the collection:
// code: pipe = createEmbeddingPipeline('code'), no prefix, query col-768, filter by modelId
// text: pipe = createEmbeddingPipeline('text'), prefix 'search_query: ', query col-768, filter by modelId
// image: CLIPVisionModelWithProjection — NOT applicable for text queries

// col-768 holds BOTH code and text embeddings. Distinguish by modelId metadata field.
// The query must use the MATCHING model to get correct similarity scores.
// Querying col-768 with a Nomic embedding finds text chunks; querying with Jina finds code chunks.
// DO NOT cross-model-query: a Jina embedding query against Nomic-indexed vectors produces garbage scores.
```

**Cross-type query design — two separate col-768 queries OR filter by modelId:**

Option A (recommended): Query `col-768` twice — once with Jina embedding (code results), once with Nomic embedding (text results). Each query is semantically aligned to its model's embedding space.

Option B: Use two separate 768-dim collections (e.g., `col-768-code` and `col-768-text`). This avoids mixing embedding spaces in one collection but requires schema changes.

**Decision: Use Option A (two queries on same col-768 collection).** The existing schema already mixes code and text in col-768 (both 768-dim). Code results are retrieved by querying with a Jina embedding; text results by querying with a Nomic embedding. Each query naturally self-filters because cosine similarity in each model's embedding space only produces high scores for vectors from the same model space. The `modelId` field provides an additional filter if needed.

**Image queries:** Images cannot be queried with text input without CLIP's text encoder. Per CONTEXT.md, Phase 5 does not implement cross-modal text-to-image search. Image collection (`col-512`) is only searched when the query comes from an image file (not a text string). For `ez-search query "<text>"`, skip the image collection.

**Top-K distribution across types:**
- Default `--top-k 10` applies per-type: fetch 10 from code, 10 from text
- Total results may be up to 20 (10 code + 10 text) in the grouped envelope
- This is intentional — AI coding assistants benefit from seeing ALL relevant context, not an artificial cap across types
- If `--type code|text|image` is specified, only that collection is queried; `--top-k` applies to that single result set

**Output envelope (JSON):**
```typescript
// Source: CONTEXT.md output format decision
const output: Record<string, unknown> = {};
if (codeResults.length > 0) output.code = codeResults;
if (textResults.length > 0) output.text = textResults;
if (imageResults.length > 0) output.image = imageResults;
// Each section only present if that collection has data
```

**Text output format:**
```
## Code
File: src/services/auth.ts | Lines: 10-45 | Relevance: 0.87
  <chunk text>

## Text
File: docs/architecture.md | Lines: 0-0 | Relevance: 0.72
  <chunk text>
```

### Pattern 6: File Type Routing in index-cmd.ts

**Current state:** `index-cmd.ts` has early-exit stubs for `type === 'text'` and `type === 'image'`.

**Phase 5 target:** When `--type` is not specified (default), index ALL file types found in the directory. When `--type code|text|image` is specified, index only that type.

**Multi-type indexing flow:**
```typescript
// Source: designed from CONTEXT.md phase boundary 2026-02-22

// No --type flag (default): index all types
const typesToIndex: FileType[] = options.type
  ? [options.type as FileType]
  : ['code', 'text', 'image'];

for (const fileType of typesToIndex) {
  // Scan for this type's files
  const files = [...await collectFiles(absPath, { useIgnoreFiles, typeFilter: fileType })];
  if (files.length === 0) continue;

  // Select correct pipeline and collection
  if (fileType === 'code') {
    await indexCodeFiles(files, col768, manifest, options);
  } else if (fileType === 'text') {
    await indexTextFiles(files, col768, manifest, options);
  } else if (fileType === 'image') {
    await indexImageFiles(files, col512, manifest, options);
  }
}

// Single optimize call AFTER all types processed
col768.optimize();
col512.optimize();
saveManifest(absPath, manifest);
```

### Anti-Patterns to Avoid

- **Querying col-768 with Nomic embedding to find code results:** Cross-model querying produces meaningless similarity scores. Always match the query embedding model to the indexed model.
- **Using quantized CLIP (q8/int8/uint8) in Node.js:** Fails with `ConvInteger(10)` error at runtime. Use `dtype: 'fp32'` exclusively.
- **Adding `search_document:` prefix at pipeline level:** The prefix must be applied by the caller (index-cmd.ts), not inside `createEmbeddingPipeline`. The pipeline is shared for both indexing and querying; query uses `search_query:`.
- **Chunking images:** One image = one vector. No sliding window for images.
- **Storing image chunks in col-768:** Images use col-512 (512-dim). Mixing dimensions causes Zvec schema errors.
- **Interleaving code and text results across models for ranking:** Scores from Jina and Nomic are NOT comparable. Group by type, rank within type.
- **Token-window chunking for text:** Use paragraph-boundary splitting for text. Token-window sliding is designed for code; applying it to natural language text degrades Nomic retrieval quality.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom PDF byte parser | `pdf-parse` npm package | PDF format is extremely complex; pure-JS library handles all edge cases |
| Image loading and decoding | `fs.readFile` + manual decode | `RawImage.fromURL(absolutePath)` from `@huggingface/transformers` | RawImage handles JPEG/PNG/WebP/GIF decoding, resizing, channel conversion internally |
| Image preprocessing for CLIP | Manual resize to 224x224 | `AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32')` | Processor applies exact normalization (mean=[0.48145, 0.4578, 0.40821], std=[0.26862, 0.26130, 0.27577]) that CLIP expects |
| Text tokenization for chunking | `encoder.encode()` per paragraph | Character-based estimate (4 chars/token) | Paragraph-boundary splitting doesn't need exact token counts; character heuristic is sufficient and avoids tokenizer load |
| Embedding dimension detection | Inspect tensor output shape | `MODEL_REGISTRY` constants in model-router.ts | Already defined: code=768, text=768, image=512 |

**Key insight:** The image preprocessing pipeline inside `AutoProcessor` is non-trivial. CLIP requires exact normalization with specific per-channel mean/std values. `AutoProcessor` handles this correctly from the model config; any custom preprocessing will produce incorrect embeddings.

## Common Pitfalls

### Pitfall 1: CLIP Quantized Model Fails in Node.js

**What goes wrong:** Loading `CLIPVisionModelWithProjection` with `dtype: 'q8'` or `dtype: 'uint8'` or `dtype: 'int8'` throws: `Error: Could not find an implementation for ConvInteger(10) node with name '/vision_model/embeddings/patch_embedding/Conv_quant'`

**Why it happens:** `onnxruntime-node` (the Node.js backend for transformers.js) does not implement the `ConvInteger` ONNX operator needed by quantized vision models. This is a known limitation confirmed in the Xenova/clip-vit-base-patch32 HuggingFace discussion thread.

**How to avoid:** Always use `{ dtype: 'fp32', device: 'cpu' }` for `CLIPVisionModelWithProjection`. The fp32 model is ~350MB; it loads once and is reused for all images in a session.

**Warning signs:** Error message mentioning `ConvInteger(10)` during model loading.

### Pitfall 2: Cross-Model Query Corruption

**What goes wrong:** Query command creates one Jina embedding and queries `col-768` — this returns a mix of code results (correct) and text results (garbage similarity scores, since Jina and Nomic live in incompatible embedding spaces).

**Why it happens:** `col-768` stores vectors from both Jina (code) and Nomic (text) models. A Jina query vector computes cosine similarity against all vectors including Nomic-generated ones, but the similarity is meaningless across model spaces.

**How to avoid:** For text results, load Nomic pipeline and embed the query with `"search_query: "` prefix. For code results, load Jina pipeline with no prefix. Query `col-768` separately with each embedding. Do not merge raw results before grouping by type.

### Pitfall 3: Missing Task Prefix for Nomic

**What goes wrong:** Text chunks are indexed without `"search_document: "` prefix, or queries are run without `"search_query: "` prefix. Retrieval quality degrades significantly (near-random results).

**Why it happens:** Nomic was trained with these instruction prefixes as part of its representation. Without them, the model produces low-quality embeddings that don't align with the training distribution.

**How to avoid:** In `index-cmd.ts` text branch, prefix every chunk text: `"search_document: " + chunk.text`. In `query-cmd.ts` text path, prefix the query: `"search_query: " + userQueryText`. The `model-router.ts` already documents this in its `MODEL_REGISTRY.text.taskPrefix` field — use those constants.

**Warning signs:** Text search returns irrelevant results even for exact phrase queries.

### Pitfall 4: PDF with Image-Only Content

**What goes wrong:** Indexing a scanned PDF produces an empty `result.text` from `pdf-parse`. The file is silently indexed with zero chunks.

**Why it happens:** `pdf-parse` cannot OCR. Scanned PDFs have no text layer.

**How to avoid:** After `pdf-parse`, check `result.text.trim().length === 0`. If empty, skip the file and log a warning. Do not insert zero-chunk entries into the manifest.

### Pitfall 5: Image Metadata Has No Line Numbers

**What goes wrong:** Query results for image files include `lineStart: 0` and `lineEnd: 0`, which confuses output formatters that expect line ranges.

**Why it happens:** Images have no line concept. The existing schema forces `lineStart`/`lineEnd` fields.

**How to avoid:** Store `lineStart: 0` and `lineEnd: 0` for images. In the output formatter, detect `lineStart === 0 && lineEnd === 0` and omit the lines field (or render as N/A). For the JSON envelope, images section may use a different result shape without `lines`.

### Pitfall 6: Text and Code Chunk IDs Collide

**What goes wrong:** A `.ts` file and a `.md` file with the same relative path (impossible in practice but hypothetically) produce the same chunk ID via `makeChunkId`.

**Why it happens:** `makeChunkId(relPath, index)` hashes the relative path. Two different files with the same path hash would collide.

**How to avoid:** In practice this cannot happen — the same relative path cannot be both `.ts` and `.md`. This pitfall is a non-issue. However, if model type is added to the chunk ID in the future, include the file extension in the hash input.

### Pitfall 7: Optimizing After Each Type Instead of Once

**What goes wrong:** Calling `col768.optimize()` after code indexing, then again after text indexing doubles the optimization time without benefit.

**Why it happens:** optimize() is called per-type instead of once after all types are processed.

**How to avoid:** Call `col768.optimize()` and `col512.optimize()` exactly once, after ALL types have been indexed and all vectors inserted. Save manifest only after both optimizations succeed.

## Code Examples

### Nomic Text Indexing (key excerpt)

```typescript
// Source: designed from model-router.ts taskPrefix + nomic-ai/nomic-embed-text-v1.5 docs

// In index-cmd.ts text branch:
const pipe = await createEmbeddingPipeline('text'); // loads nomic-ai/nomic-embed-text-v1.5

// Prefix required for document embedding:
const texts = batch.map((c) => `search_document: ${c.text}`);
const embeddings = await pipe.embed(texts);

// Insert into col-768 (same collection as code):
col768.insert(chunkId, embeddings[i], {
  filePath: relPath,
  chunkIndex: chunk.index,
  modelId: pipe.modelId, // 'nomic-ai/nomic-embed-text-v1.5'
  lineStart: 0,
  lineEnd: 0,
  chunkText: chunk.text, // stored WITHOUT prefix — prefix is for embedding only
});
```

### CLIP Image Indexing (key excerpt)

```typescript
// Source: Xenova/clip-vit-base-patch32 hub page + transformers.js docs

import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';

// Load once per session (lazy):
env.cacheDir = resolveModelCachePath();
env.allowRemoteModels = true;
const processor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32');
const visionModel = await CLIPVisionModelWithProjection.from_pretrained(
  'Xenova/clip-vit-base-patch32',
  { dtype: 'fp32', device: 'cpu' } // fp32 REQUIRED — quantized fails in Node.js
);

// Per-image:
const image = await RawImage.fromURL(file.absolutePath); // accepts local file paths
const inputs = await processor(image);
const { image_embeds } = await visionModel(inputs);
// image_embeds.data: Float32Array of length 512

const embedding = new Float32Array(image_embeds.data);

col512.insert(imageId, embedding, {
  filePath: file.relativePath,
  chunkIndex: 0,
  modelId: 'Xenova/clip-vit-base-patch32',
  lineStart: 0,
  lineEnd: 0,
  chunkText: '', // no text for images
});
```

### PDF Text Extraction

```typescript
// Source: pdf-parse npm package API (standard usage)
import pdfParse from 'pdf-parse';
import { readFile } from 'fs/promises';

async function extractPdfText(absolutePath: string): Promise<string> {
  const buffer = await readFile(absolutePath);
  const result = await pdfParse(buffer);
  return result.text; // full concatenated text from all pages
}
```

### Paragraph-Based Text Chunking

```typescript
// Source: designed for Phase 5 — Claude's Discretion area per CONTEXT.md
// Character estimate ~4 chars/token; target ~400 tokens = ~1600 chars

const MAX_CHUNK_CHARS = 1600; // ~400 tokens

export function chunkTextContent(text: string): Array<{ text: string; chunkIndex: number }> {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  const chunks: Array<{ text: string; chunkIndex: number }> = [];
  let current = '';
  let idx = 0;

  for (const para of paragraphs) {
    const wouldExceed = current.length + para.length + 2 > MAX_CHUNK_CHARS;
    if (wouldExceed && current.length > 0) {
      chunks.push({ text: current.trim(), chunkIndex: idx++ });
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }

  if (current.trim().length > 0) {
    chunks.push({ text: current.trim(), chunkIndex: idx });
  }

  return chunks;
}
```

### Multi-Type Query (key structure)

```typescript
// Source: CONTEXT.md grouped envelope output decision + cross-model routing design

const output: { code?: ResultItem[]; text?: ResultItem[]; image?: ResultItem[] } = {};

// Code: embed with Jina, no prefix, query col-768, filter modelId=jina
const [codeEmbedding] = await jinaCode.pipe.embed([queryText]);
const codeRaw = safeQuery(col768, codeEmbedding, fetchK);
const codeFiltered = codeRaw.filter(r => r.metadata['modelId'] === 'jinaai/jina-embeddings-v2-base-code');
if (codeFiltered.length > 0) output.code = normalizeAndCollapse(codeFiltered).slice(0, topK);

// Text: embed with Nomic + search_query prefix, query col-768, filter modelId=nomic
const [textEmbedding] = await nomicPipe.embed([`search_query: ${queryText}`]);
const textRaw = safeQuery(col768, textEmbedding, fetchK);
const textFiltered = textRaw.filter(r => r.metadata['modelId'] === 'nomic-ai/nomic-embed-text-v1.5');
if (textFiltered.length > 0) output.text = normalize(textFiltered).slice(0, topK);

// Image: skip for text queries (no text-to-image cross-modal search in Phase 5)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Code-only indexing (Phase 4) | Code + text + image with auto-detection | Phase 5 | Full document corpus indexable |
| `--type` defaults to code | `--type` defaults to all types | Phase 5 | Single `ez-search index .` indexes everything |
| Single result list | Grouped envelope `{ code, text, image }` | Phase 5 | AI agents can select by type |
| `quantized: true` (old Transformers.js) | `dtype: 'fp32'` / `dtype: 'q8'` (v3) | Transformers.js v3 | More control; CLIP requires fp32 in Node.js |
| token-window chunking for all text | paragraph-boundary for text, token-window for code | Phase 5 | Nomic retrieval quality significantly better with paragraph chunks |

**Deprecated/outdated:**
- Early-exit stubs in `index-cmd.ts` for `type === 'text'` and `type === 'image'`: Replace with real implementations in Phase 5.
- `--type` defaulting to `'code'`: Remove default; scan all types when unspecified.

## Open Questions

1. **Image query support (text-to-image)**
   - What we know: CLIP has a text encoder that produces 512-dim text embeddings in the same space as image embeddings — enabling text-to-image search.
   - What's unclear: CONTEXT.md does not explicitly require this for Phase 5. Success Criteria 4 says "query auto-detects which collections have data and searches across all indexed types" but uses a text query.
   - Recommendation: For Phase 5, skip text-to-image search (CLIP text encoder not loaded). If `col-512` has data and the query is a text string, either skip image results or implement CLIP text embedding. Default to skipping — simpler, and image search via text query is a separate feature.

2. **Nomic on same col-768 as Jina — modelId filter reliability**
   - What we know: Both code and text vectors share `col-768`. Query results are post-filtered by `modelId` metadata field.
   - What's unclear: If Zvec returns low-relevance cross-model results ahead of high-relevance same-model results (HNSW is approximate), the modelId filter could discard relevant results.
   - Recommendation: Over-fetch (`topK * 5`) before modelId filtering to compensate. The existing `topK * 3` over-fetch is for dir/threshold filters; add another multiplier layer when col-768 contains mixed model vectors.

3. **CSV/JSON/YAML classification**
   - What we know: `EXTENSION_MAP` does not include `.csv`, `.json`, `.yaml`. CONTEXT.md marks this as "Claude's Discretion."
   - Recommendation: `.csv` → text (tabular data, readable by Nomic). `.json` and `.yaml` → code (structured config files, similar to code semantics, better handled by Jina). Add to `EXTENSION_MAP` in `types.ts`.

4. **Image display in query results**
   - What we know: Image results have no `chunkText` and no line numbers. The existing output formatters assume `chunkText` exists.
   - What's unclear: What should the text output show for image results? File path + score only?
   - Recommendation: For image results in `--format text`, display `File: <path> | Relevance: <score>` without lines or content (images cannot be inlined in text). For JSON, omit `lines` and `text` fields in the image section.

## Sources

### Primary (HIGH confidence — verified from codebase + official sources)
- `/home/dev/work/ez-search/src/services/model-router.ts` — Nomic model already registered with taskPrefix; createEmbeddingPipeline('text') already implemented
- `/home/dev/work/ez-search/src/types.ts` — FileType 'text'/'image' declared; EXTENSION_MAP already routes .md/.jpg/.png
- `/home/dev/work/ez-search/src/services/vector-db.ts` — col-768 and col-512 already open; both schemas include chunkText, filePath, modelId
- [https://huggingface.co/nomic-ai/nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) — task prefix requirements; `pooling: 'mean', normalize: true` confirmed
- [https://huggingface.co/docs/transformers.js/en/api/utils/image](https://huggingface.co/docs/transformers.js/en/api/utils/image) — `RawImage.fromURL()` accepts local file paths; `RawImage.read()` API
- [https://huggingface.co/docs/transformers.js/en/guides/dtypes](https://huggingface.co/docs/transformers.js/en/guides/dtypes) — dtype options for Transformers.js v3; fp32/q8/int8/uint8/q4 quantization levels

### Secondary (MEDIUM confidence — WebSearch verified with official discussion)
- [https://huggingface.co/Xenova/clip-vit-base-patch32/discussions/1](https://huggingface.co/Xenova/clip-vit-base-patch32/discussions/1) — int8 and uint8 ONNX vision models fail with onnxruntime-node ConvInteger(10) error; fp32 is the safe choice
- [https://github.com/huggingface/transformers.js/issues/1112](https://github.com/huggingface/transformers.js/issues/1112) — image-feature-extraction pipeline regression in v3.2.2; fixed in PR #1114
- CLIPVisionModelWithProjection usage pattern (from multiple consistent WebSearch results cross-referencing official HuggingFace CLIP model pages)
- pdf-parse Buffer API — consistent across npm documentation and multiple usage guides

### Tertiary (LOW confidence — WebSearch only, not independently verified against official source)
- Paragraph chunking strategy performance for Nomic — research suggests paragraph-level > token-window for text models; not verified against Nomic-specific benchmarks
- `image_embeds` field name in `CLIPVisionModelWithProjection` output — reported consistently in multiple examples but not verified against transformers.js source directly
- Top-K per-type allocation (10+10=20 total) — designed from CONTEXT.md; actual AI agent consumption preference not empirically tested

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all infrastructure already exists; only `pdf-parse` is new
- Nomic text pipeline: HIGH — model already registered in model-router.ts; task prefix documented authoritatively
- CLIP image pipeline: MEDIUM — dtype: fp32 constraint is HIGH confidence (confirmed failure of quantized); exact API for `image_embeds` extraction is MEDIUM (multiple consistent sources but not verified in source code)
- Text chunking: MEDIUM — paragraph-based approach is well-supported by RAG research; specific character thresholds are estimates
- Query routing: HIGH — col-768 modelId filter design is sound; over-fetch multiplier is estimated
- PDF extraction: HIGH — pdf-parse is the standard library; Buffer API is well-documented

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable domain; main risk is CLIP dtype compatibility changes in future transformers.js releases)
