# Technology Stack

**Project:** ez-search
**Researched:** 2026-02-22
**Overall Confidence:** MEDIUM-HIGH

---

## Recommended Stack

### Runtime

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | v22+ (LTS) | Runtime | Required for WebGPU support via Dawn. Node 22 is current LTS (active until 2027). Node 24 is latest but 22 is safer for native addon compatibility. | HIGH |
| TypeScript | 5.x | Language | Type safety for complex model routing, CLI parsing, and vector DB interactions. | HIGH |

### ML Inference

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @huggingface/transformers | `@next` (v4 preview) | Model loading, tokenization, inference | v4 released Feb 9, 2026 as preview. Wraps ONNX Runtime with a high-level pipeline API. WebGPU runtime rewritten in C++ with 4x speedup for BERT models. Supports Node.js, Bun, Deno with WebGPU. The `@next` tag is required -- stable npm is still v3.8.1 which lacks the new WebGPU runtime. | HIGH |

**Backend strategy: WebGPU > WASM > CPU fallback**

Transformers.js v4 supports three execution backends. The recommended priority:

1. **WebGPU (GPU)** -- 4x faster for BERT-class embedding models. Available in Node.js v22+ via Dawn bindings. Set `device: 'webgpu'` in pipeline options.
2. **WASM (CPU)** -- Fallback for systems without GPU or when WebGPU is unavailable. Still usable performance for small batches.
3. **onnxruntime-node (native CPU/CUDA)** -- Transformers.js uses this automatically in Node.js. Provides native performance with access to CUDA on supported systems.

**Critical note:** WebGPU in Node.js is still experimental. The `webgpu` npm package (dawn-gpu/node-webgpu) provides Dawn bindings if the built-in Node module is insufficient. Plan for WASM fallback from day one.

### Vector Database

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @zvec/zvec | latest (Feb 2026) | Vector storage & similarity search | In-process C++ engine (Alibaba's Proxima). No server process. Supports dense + sparse vectors, hybrid search, CRUD, cosine similarity. Node.js SDK via npm confirmed on zvec.org docs. Apache 2.0 license. | MEDIUM |

**Zvec risk assessment:**

Zvec was open-sourced in early February 2026 -- it is extremely new. While the underlying Proxima engine is battle-tested at Alibaba scale, the Node.js SDK is brand new and may have rough edges:

- Platform support: Linux x86_64, Linux ARM64, macOS ARM64. No Windows support documented.
- The npm package `@zvec/zvec` exists per official docs/README, but community adoption is near zero (released ~2 weeks ago).
- No ecosystem integrations yet (no LangChain adapter, no community tutorials).

**Fallback plan (ordered by preference):**

| Alternative | When to Use | Trade-off |
|-------------|-------------|-----------|
| **hnswlib-node** | If zvec SDK is buggy or platform-incompatible | Proven HNSW bindings, but no built-in CRUD/metadata/filtering. You manage persistence yourself. |
| **LanceDB** (@lancedb/lancedb) | If you need richer query features | Embedded columnar vector DB, mature Node.js SDK, Apache 2.0. Heavier than zvec but production-proven. Used by AnythingLLM. |
| **Vectra** | If you want pure JS simplicity | File-backed JSON, zero native deps, in-memory search. Fast for small indexes (<100K vectors). No native code compilation issues. |

**Recommendation:** Start with @zvec/zvec as specified in the PRD. Write a thin abstraction layer over the vector DB so you can swap to hnswlib-node or LanceDB if zvec proves unstable. The abstraction should expose: `createCollection`, `insert`, `query`, `delete`, `close`.

### File Hashing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| xxhash-wasm | 1.x | Non-cryptographic file hashing for cache validation | ~16 GB/s throughput for large inputs via WASM. 1M+ weekly npm downloads. Mature, stable. ~2ms init overhead (one-time). Orders of magnitude faster than SHA256/MD5 for cache validation where collision resistance is irrelevant. | HIGH |

**Usage pattern:**
- Initialize WASM module once at startup
- Use `h64ToString(buffer)` for file content hashing
- Combine with `fs.stat` mtime/size for two-tier change detection

### CLI Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| commander | 13.x | CLI argument parsing, command routing | Battle-tested, lightweight, minimal dependencies. 100M+ weekly downloads. Fluent API for defining commands/options. Perfect for a focused tool with 2-3 commands. | HIGH |
| ora | 8.x | Terminal spinners | Visual feedback during long model loading and indexing operations. | HIGH |

**Why not alternatives:**
- **oclif**: Overkill. Plugin architecture, scaffolding, heavy dependencies. ez-search has 2 commands.
- **yargs**: Fine alternative, but commander's fluent API is cleaner for simple CLIs.
- **clipanion**: Class-based API adds unnecessary abstraction for this use case.

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| ignore | latest | .gitignore/.cursorignore parsing | File exclusion during directory traversal | HIGH |
| glob / fast-glob | latest | File pattern matching | Directory traversal with extension filtering | HIGH |
| chalk | 5.x | Terminal coloring | Human-readable output formatting | HIGH |

---

## Embedding Models

### Code Embeddings

| Model | HF Path | Dimensions | Context | Why | Confidence |
|-------|---------|------------|---------|-----|------------|
| Jina Embeddings v2 Code | `Xenova/jina-embeddings-v2-base-code` | 768 | 8192 tokens | Trained on GitHub code + documentation. Understands programming syntax. ONNX weights available via Xenova conversion. Works with Transformers.js pipeline API. | MEDIUM |

**Consideration:** Jina embeddings v3 exists but the ONNX/Transformers.js-ready version via Xenova is v2. The v2 model is well-tested with Transformers.js.

### Text/Document Embeddings

| Model | HF Path | Dimensions | Context | Why | Confidence |
|-------|---------|------------|---------|-----|------------|
| Nomic Embed Text v1.5 | `nomic-ai/nomic-embed-text-v1.5` | 768 (or 256/512 via Matryoshka) | 8192 tokens | Top-tier MTEB performance. Matryoshka dimension reduction allows trading accuracy for speed/storage. ONNX files included in official repo (converted by Xenova). Requires task prefix: `search_document:` for docs, `search_query:` for queries. | HIGH |

**Note:** Nomic v2 (MoE architecture, 475M params) exists but is significantly larger. v1.5 is the sweet spot for local inference.

### Image Embeddings

| Model | HF Path | Dimensions | Why | Confidence |
|-------|---------|------------|-----|------------|
| CLIP ViT-B/32 | `Xenova/clip-vit-base-patch32` | 512 | Proven multimodal model. Maps images and text to same vector space. Small enough for local inference. ONNX weights available. | HIGH |

**Alternatives considered:**
- **Jina CLIP v2** (`jinaai/jina-clip-v2`): 0.9B params, 89 languages, 512x512 resolution. But: reported ~1700ms/image on M1 Max, requires dummy inputs for single-modality use, ONNX loading issues reported. Too heavy and buggy for v1.
- **SigLIP** (`Xenova/siglip-base-patch16-224`): Better loss function than CLIP, 768-dim output. Viable alternative if CLIP accuracy is insufficient. Works with Transformers.js.
- **SigLIP2** (Feb 2025): Newer, but NaFlex variant lacks Transformers.js support (open issue #1402).

**Recommendation:** Start with CLIP ViT-B/32 for v1 (proven, fast, small). Upgrade to SigLIP or Jina CLIP v2 later if image search quality needs improvement.

### Embedding Dimension Summary

| Pipeline | Model | Dimensions | Metric |
|----------|-------|------------|--------|
| Code | jina-embeddings-v2-base-code | 768 | Cosine |
| Text | nomic-embed-text-v1.5 | 768 | Cosine |
| Image | clip-vit-base-patch32 | 512 | Cosine |

**Important:** Code and text share 768 dimensions, but image uses 512. This means separate vector collections per pipeline, or padding/projection to unify dimensions (not recommended for v1).

---

## WebGPU in Node.js -- Current State

**Status as of Feb 2026:** Experimental but usable.

Node.js includes a WebGPU module based on Dawn (Google's C++ WebGPU implementation). The `webgpu` npm package publishes `dawn.node` bindings separately. Transformers.js v4 was built to leverage this.

**What works:**
- Embedding generation with BERT-class models
- WebGPU acceleration on systems with Vulkan/Metal/D3D12 capable GPUs
- Fallback to WASM/CPU when WebGPU is unavailable

**What to watch:**
- The Node.js WebGPU API may change before stabilization
- Some CI/CD environments (Docker, headless Linux) may lack GPU drivers
- Memory management for batched inference needs careful tuning

**Practical approach:**
```typescript
// Try WebGPU, fall back gracefully
let device = 'webgpu';
try {
  const extractor = await pipeline('feature-extraction', modelId, { device: 'webgpu' });
} catch {
  device = 'cpu'; // or 'wasm'
  const extractor = await pipeline('feature-extraction', modelId, { device });
}
```

---

## Alternatives Considered (Full Matrix)

### ML Inference

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| @huggingface/transformers@next | onnxruntime-node directly | Transformers.js wraps ONNX Runtime and adds model loading, tokenization, preprocessing. Using ONNX Runtime directly means reimplementing all of that. |
| @huggingface/transformers@next | tensorflow.js | TF.js is heavier, less model availability for embedding tasks, WebGPU support is less mature than ONNX Runtime's. |

### Vector Database

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| @zvec/zvec | hnswlib-node | No built-in CRUD, metadata filtering, or persistence management. You'd build a lot of plumbing. |
| @zvec/zvec | @lancedb/lancedb | Heavier dependency, columnar format is overkill for embedding-only storage. But it's the best fallback if zvec fails. |
| @zvec/zvec | vectra | JSON-backed, loads everything into memory. Won't scale past ~100K vectors. Fine for prototyping. |
| @zvec/zvec | chromadb | Requires a separate server process. Violates the "in-process, no server" requirement. |
| @zvec/zvec | faiss-node | FAISS Node.js bindings exist but are poorly maintained. Native compilation issues common. |

### Hashing

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| xxhash-wasm | hash-wasm (xxhash64) | Slightly faster for tiny inputs (32 bytes), identical for large files. But xxhash-wasm is more focused, lighter, 1M+ weekly downloads. |
| xxhash-wasm | crypto.createHash('sha256') | 10-100x slower. Cryptographic guarantees are unnecessary for cache validation. |
| xxhash-wasm | farmhash | Native addon, platform compilation issues. WASM is more portable. |

---

## Installation

```bash
# Core dependencies
npm install @huggingface/transformers@next @zvec/zvec commander ora xxhash-wasm ignore

# Dev dependencies
npm install -D typescript @types/node tsx

# Optional: explicit WebGPU bindings (if Node built-in is insufficient)
npm install webgpu
```

**Node.js requirement:**
```json
{
  "engines": {
    "node": ">=22.0.0"
  }
}
```

---

## Key Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| @zvec/zvec is 2 weeks old, SDK may be buggy | HIGH | Write DB abstraction layer. Have LanceDB or hnswlib-node as fallback. Test early. |
| WebGPU unstable in Node.js | MEDIUM | Implement graceful fallback to WASM/CPU. Test on CI without GPU. |
| Transformers.js v4 is "preview" (@next tag) | MEDIUM | Pin exact version. Monitor HF blog for stable release. v3.8.1 stable is fallback but lacks new WebGPU runtime. |
| Different embedding dimensions per pipeline (768 vs 512) | LOW | Use separate vector collections per content type. Don't try to unify. |
| Model download size (~100-400MB per model) | LOW | Lazy-load models. Cache in `.ez-search/models/` or use HF cache. First-run UX should show download progress. |

---

## Sources

### HIGH Confidence (Official Docs / GitHub)
- [Transformers.js v4 announcement](https://huggingface.co/blog/transformersjs-v4) -- Feb 9, 2026
- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/en/guides/webgpu)
- [Zvec official documentation](https://zvec.org/en/docs/)
- [Zvec GitHub](https://github.com/alibaba/zvec)
- [xxhash-wasm GitHub](https://github.com/jungomi/xxhash-wasm)
- [hnswlib-node GitHub](https://github.com/yoshoku/hnswlib-node)
- [LanceDB npm](https://www.npmjs.com/package/@lancedb/lancedb)
- [dawn-gpu/node-webgpu GitHub](https://github.com/dawn-gpu/node-webgpu)
- [Xenova/nomic-embed-text-v1 on HuggingFace](https://huggingface.co/Xenova/nomic-embed-text-v1)
- [nomic-ai/nomic-embed-text-v1.5 on HuggingFace](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
- [Xenova/siglip-base-patch16-224 on HuggingFace](https://huggingface.co/Xenova/siglip-base-patch16-224)
- [jinaai/jina-clip-v2 on HuggingFace](https://huggingface.co/jinaai/jina-clip-v2)

### MEDIUM Confidence (Verified WebSearch)
- [Transformers.js v4 third-party coverage](https://www.adwaitx.com/transformers-js-v4-webgpu-browser-ai/)
- [Zvec "SQLite of Vector DBs" analysis](https://medium.com/@AdithyaGiridharan/zvec-alibaba-just-open-sourced-the-sqlite-of-vector-databases-and-its-blazing-fast-15c31cbfebbf)
- [Zvec technical overview - MarkTechPost](https://www.marktechpost.com/2026/02/10/alibaba-open-sources-zvec-an-embedded-vector-database-bringing-sqlite-like-simplicity-and-high-performance-on-device-rag-to-edge-applications/)
- [Embedding models comparison guide](https://www.openxcell.com/blog/best-embedding-models/)
- [WebGPU browser ecosystem](https://developer.chrome.com/docs/web-platform/webgpu/webgpu-ecosystem)

### LOW Confidence (Unverified / Needs Validation)
- Zvec Node.js SDK actual API surface and stability -- confirmed to exist via official docs, but zero community usage reports
- Transformers.js v4 Node.js WebGPU performance benchmarks in real-world CLI usage -- blog claims 4x BERT speedup but no independent verification
- Exact batch size limits before VRAM OOM on consumer GPUs -- PRD says 32 but optimal value needs empirical testing
