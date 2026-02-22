# Phase 1: Validation Spike - Research

**Researched:** 2026-02-22
**Domain:** @zvec/zvec (vector DB), @huggingface/transformers v4 (ML inference), WebGPU on NixOS
**Confidence:** HIGH — all findings verified by direct execution on the target NixOS machine

## Summary

This research validates the two risky dependencies for ez-search: the Zvec Node.js SDK and
Transformers.js v4 WebGPU inference. Both were tested directly on the target NixOS system
(AMD Ryzen 9 7950X3D + AMD Radeon RX 7900 XTX).

**Zvec (@zvec/zvec v0.2.0)**: Ships prebuilt binaries for linux-x64 via the optional dependency
`@zvec/bindings-linux-x64`. Confirmed working on NixOS without any extra system packages. The
TypeScript API is fully typed. All CRUD operations (create, insert, query, delete) work correctly.
The library is 11 days old with zero community usage; the API is synchronous-only (`insertSync`,
`querySync`, `deleteSync`).

**Transformers.js v4 (@huggingface/transformers@4.0.0-next.4)**: CPU/WASM inference works without
any extra deps. WebGPU inference requires `libvulkan.so.1` in `LD_LIBRARY_PATH` — this is NOT
present by default on NixOS but is available via `vulkan-loader` in nixpkgs. The machine has an
AMD RX 7900 XTX with RADV Vulkan driver, making real GPU acceleration available. Both code
(`jinaai/jina-embeddings-v2-base-code`) and text (`nomic-ai/nomic-embed-text-v1.5`) models
confirmed working on CPU. WebGPU confirmed working with Vulkan via `nix-shell -p vulkan-loader`.

**Primary recommendation:** Both dependencies work on NixOS. WebGPU requires `LD_LIBRARY_PATH`
pointing to `vulkan-loader` — use `nix-shell -p vulkan-loader` or set this in the project's
`shell.nix`/`flake.nix`. CPU fallback is always available with no extra setup.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @zvec/zvec | 0.2.0 | In-process vector database | Required by project spec; confirmed working |
| @huggingface/transformers | 4.0.0-next.4 (`@next` tag) | ML inference, embeddings | Required by project spec; v4 is the current next release |

### Supporting (Fallback)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @lancedb/lancedb | 0.26.2 | Embedded vector DB fallback | If Zvec proves unstable or API-breaking |

### System Dependencies (NixOS)
| Dependency | Nix Package | Purpose | Required For |
|------------|-------------|---------|--------------|
| libvulkan.so.1 | vulkan-loader | GPU backend for WebGPU | WebGPU inference only |
| RADV drivers | mesa | AMD Vulkan driver | WebGPU on AMD GPU |

**Installation:**
```bash
npm install @zvec/zvec
npm install @huggingface/transformers@next
```

For WebGPU on NixOS, the project shell.nix or flake.nix must include `vulkan-loader`:
```nix
# shell.nix
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = [ pkgs.nodejs_22 pkgs.vulkan-loader ];
  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.vulkan-loader}/lib:$LD_LIBRARY_PATH
  '';
}
```

## Architecture Patterns

### Zvec Collection Lifecycle

```typescript
// Source: package/src/index.d.ts (verified by reading package contents)
import {
  ZVecCreateAndOpen,
  ZVecOpen,
  ZVecCollectionSchema,
  ZVecDataType,
  ZVecIndexType,
  ZVecMetricType,
  ZVecInitialize,
  type ZVecDocInput,
  type ZVecQuery,
} from '@zvec/zvec';

// Initialize once at startup (optional, sets log level etc.)
ZVecInitialize({ logLevel: ZVecLogLevel.WARN });

// Create schema
const schema = new ZVecCollectionSchema({
  name: 'documents',
  vectors: {
    name: 'embedding',
    dataType: ZVecDataType.VECTOR_FP32,
    dimension: 768,
    indexParams: {
      indexType: ZVecIndexType.HNSW,
      metricType: ZVecMetricType.COSINE,
      m: 50,
      efConstruction: 500,
    },
  },
  fields: [
    { name: 'path', dataType: ZVecDataType.STRING },
    { name: 'content', dataType: ZVecDataType.STRING },
  ],
});

// Create and open (first time)
const collection = ZVecCreateAndOpen('./data/my-collection', schema);

// Open existing (subsequent runs)
// const collection = ZVecOpen('./data/my-collection');

// Insert
const status = collection.insertSync({
  id: 'file:src/index.ts:0',
  vectors: { embedding: new Float32Array(768) },
  fields: { path: 'src/index.ts', content: '...' },
});

// Query
const results = collection.querySync({
  fieldName: 'embedding',
  vector: queryVector,
  topk: 10,
  filter: "path like 'src/%'",  // optional scalar filter
  outputFields: ['path', 'content'],
});

// Delete by id
collection.deleteSync('file:src/index.ts:0');
// Delete by filter
collection.deleteByFilterSync("path = 'src/index.ts'");

// Cleanup
collection.optimizeSync();
collection.closeSync();
```

### Transformers.js v4 WebGPU-to-CPU Fallback Pattern

```typescript
// Source: verified by execution on NixOS target machine
import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = true;
// For offline use, set env.allowLocalModels = true; env.localModelPath = '...';

async function createEmbeddingPipeline(modelId: string) {
  // Try WebGPU first (requires libvulkan.so.1 in LD_LIBRARY_PATH on NixOS)
  try {
    const pipe = await pipeline('feature-extraction', modelId, {
      device: 'webgpu',
      dtype: 'fp32',
    });
    console.log('Using WebGPU backend');
    return { pipe, backend: 'webgpu' as const };
  } catch (err) {
    console.warn('WebGPU unavailable, falling back to CPU:', (err as Error).message);
  }

  // CPU fallback (always works, no extra deps)
  const pipe = await pipeline('feature-extraction', modelId, {
    device: 'cpu',
    dtype: 'q8',  // quantized for CPU performance
  });
  console.log('Using CPU backend');
  return { pipe, backend: 'cpu' as const };
}

// Usage for code embeddings (768-dim, 8k context)
const { pipe: codePipe, backend } = await createEmbeddingPipeline(
  'jinaai/jina-embeddings-v2-base-code'
);
const codeEmbedding = await codePipe(
  ['function hello() { return "world"; }'],
  { pooling: 'mean' }
);
// codeEmbedding.dims = [1, 768]

// Usage for text embeddings (768-dim)
const { pipe: textPipe } = await createEmbeddingPipeline(
  'nomic-ai/nomic-embed-text-v1.5'
);
const textEmbedding = await textPipe(
  ['search_document: some text to embed'],
  { pooling: 'mean', normalize: true }
);
// textEmbedding.dims = [1, 768]
```

### Recommended Project Structure
```
src/
├── db/                    # Zvec wrapper
│   ├── collection.ts      # ZVecCreateAndOpen / ZVecOpen wrapper
│   └── types.ts           # Domain types for documents
├── embeddings/            # Transformers.js wrapper
│   ├── pipeline.ts        # WebGPU-to-CPU fallback factory
│   └── models.ts          # Model ID constants
└── spike/                 # Phase 1 validation scripts
    ├── zvec-spike.ts      # Zvec CRUD proof
    └── transformers-spike.ts  # WebGPU + CPU inference proof
```

### Anti-Patterns to Avoid
- **Async wrappers around Zvec sync methods**: The API is `insertSync` / `querySync` etc. These are
  synchronous native calls; wrapping in `new Promise(resolve => resolve(collection.querySync(...)))`
  adds overhead without benefit. Use directly or in a worker thread if blocking is a concern.
- **Calling `ZVecCreateAndOpen` multiple times on the same path**: Each call opens the collection;
  always close the previous handle first.
- **Using device `'wasm'` explicitly**: In Node.js with Transformers.js v4, `'cpu'` is the correct
  device string for the Node.js native ONNX backend. `'wasm'` is the browser CPU fallback. Use
  `'cpu'` for server-side inference.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | Custom HNSW | @zvec/zvec `querySync` | HNSW correctness is hard; Zvec uses battle-tested Proxima engine |
| ONNX model inference | Raw ONNX Runtime | @huggingface/transformers pipeline | Handles model download, tokenization, pooling, dtype |
| CPU/GPU backend detection | Manual env checks | try/catch around `device: 'webgpu'` | Library throws immediately with clear error; no detection needed |
| Vector similarity math | cosine_sim functions | transformers.js `cos_sim` utility | Already exported from the library |
| Model caching | Custom disk cache | transformers.js built-in cache | `env.cacheDir` auto-caches to `node_modules/@huggingface/transformers/.cache/` |

**Key insight:** Both dependencies do heavy lifting internally. The spike should be thin wrappers
that prove the API works end-to-end, not reimplementations.

## Common Pitfalls

### Pitfall 1: Zvec Binary Not Found on Unsupported Platform
**What goes wrong:** `npm install @zvec/zvec` succeeds but `require('@zvec/zvec')` throws
"Prebuilt binary not found for darwin-x64" (Intel Mac) or Windows.
**Why it happens:** `@zvec/bindings-${platform}-${arch}` is an optionalDependency. The install
script exits(1) if the platform package isn't found, but npm ignores this.
**How to avoid:** The install script (`scripts/install.js`) runs on `npm install` and calls
`process.exit(1)` if the binary is missing, which will surface the error. Platform support is
linux-x64, linux-arm64, darwin-arm64 only.
**Warning signs:** `Error: zvec Error: Prebuilt binary not found for ...` at runtime.

### Pitfall 2: WebGPU Fails Silently in Wrong Node.js Version
**What goes wrong:** `device: 'webgpu'` throws an error about missing Vulkan, but the error
message references internal C++ paths which are confusing.
**Why it happens:** WebGPU in Node.js via onnxruntime requires `libvulkan.so.1` at runtime.
NixOS does not add vulkan-loader to the global `LD_LIBRARY_PATH` by default.
**How to avoid:** Use the try/catch fallback pattern. The error is thrown synchronously during
`pipeline()` initialization, making it easy to catch. Add `nix-shell -p vulkan-loader` or
set `LD_LIBRARY_PATH` in shell.nix.
**Warning signs:** Error message contains "Couldn't load Vulkan: libvulkan.so.1: cannot open
shared object file".

### Pitfall 3: Xenova Model Variants Require Authentication
**What goes wrong:** Models under `Xenova/` namespace sometimes return HTTP 401.
Specifically `Xenova/nomic-embed-text-v1.5`, `Xenova/jina-embeddings-v2-base-code`, and
`Xenova/clip-vit-base-patch32` all return 401 without auth.
**Why it happens:** Some Xenova model repos are gated or restricted. The original model repos
(jinaai, nomic-ai) are publicly accessible and already have ONNX weights.
**How to avoid:** Use the official model IDs with ONNX weights directly:
- Code: `jinaai/jina-embeddings-v2-base-code` (has `onnx/model_quantized.onnx`)
- Text: `nomic-ai/nomic-embed-text-v1.5` (has `onnx/model_quantized.onnx`)
- Image: `Xenova/clip-vit-base-patch32` (publicly accessible, 307 redirect = OK)
**Warning signs:** `Unauthorized access to file: "https://huggingface.co/Xenova/..."`.

### Pitfall 4: Zvec API is Synchronous Only
**What goes wrong:** Developer assumes async API, writes `await collection.insert(...)`, gets
`undefined` because there is no async variant.
**Why it happens:** All Zvec Node.js methods end in `Sync`: `insertSync`, `querySync`,
`deleteSync`, `optimizeSync`, `closeSync`. These are native bindings, not async.
**How to avoid:** Use the `Sync` methods directly. For large batch operations that block the
event loop, run in a worker thread. The TypeScript types enforce this correctly.
**Warning signs:** TypeScript type error "Property 'insert' does not exist on type 'ZVecCollection'".

### Pitfall 5: Zvec `ZVecCreateAndOpen` vs `ZVecOpen` Error Codes
**What goes wrong:** Calling `ZVecCreateAndOpen` on an existing path throws
`ZVEC_ALREADY_EXISTS`. Calling `ZVecOpen` on a non-existent path throws `ZVEC_NOT_FOUND`.
**Why it happens:** The functions are distinct: create-and-open only for new collections, open
only for existing ones.
**How to avoid:** Use a helper that tries `ZVecOpen` first, falls back to `ZVecCreateAndOpen`
on `ZVEC_NOT_FOUND`. Check the `ZVecError.code` property to distinguish errors.

### Pitfall 6: nomic-embed-text-v1.5 Requires Task Prefix
**What goes wrong:** Embeddings work but semantic search quality is poor.
**Why it happens:** nomic-embed-text models use task prefixes in the input text. Without the
prefix, the model produces suboptimal embeddings.
**How to avoid:** Prefix inputs appropriately:
- `"search_document: "` for indexing documents
- `"search_query: "` for query embedding
- `"clustering: "` for clustering tasks

## Code Examples

### Zvec: Open-or-Create Pattern
```typescript
// Source: verified against package/src/index.d.ts and live execution
import {
  ZVecCreateAndOpen,
  ZVecOpen,
  ZVecCollectionSchema,
  ZVecDataType,
  ZVecIndexType,
  ZVecMetricType,
  isZVecError,
  type ZVecCollection,
} from '@zvec/zvec';

function openOrCreateCollection(
  path: string,
  schema: ZVecCollectionSchema
): ZVecCollection {
  try {
    return ZVecOpen(path);
  } catch (err) {
    if (isZVecError(err) && err.code === 'ZVEC_NOT_FOUND') {
      return ZVecCreateAndOpen(path, schema);
    }
    throw err;
  }
}
```

### Transformers.js v4: Node.js WebGPU Check
```typescript
// Source: verified by execution on NixOS AMD RX 7900 XTX + vulkan-loader
// navigator.gpu is defined in Node.js by onnxruntime but may be undefined if
// the WebGPU backend fails to initialize.
import { pipeline } from '@huggingface/transformers';

async function getDevice(): Promise<'webgpu' | 'cpu'> {
  // Quick probe: try to load a trivial pipeline with WebGPU
  // The failure is fast (no model download needed, fails at backend init)
  try {
    await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'webgpu',
      dtype: 'fp32',
    });
    return 'webgpu';
  } catch {
    return 'cpu';
  }
}
```

### NixOS Shell Configuration for WebGPU
```nix
# shell.nix
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs_22
    pkgs.vulkan-loader
    pkgs.mesa  # for ICD files at /run/opengl-driver/share/vulkan/icd.d/
  ];
  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.vulkan-loader}/lib:$LD_LIBRARY_PATH
  '';
}
```

### Zvec CRUD Proof Sequence
```typescript
// Source: verified by execution on NixOS (all operations confirmed working)
import {
  ZVecCreateAndOpen,
  ZVecCollectionSchema,
  ZVecDataType,
  ZVecIndexType,
  ZVecMetricType,
} from '@zvec/zvec';

const schema = new ZVecCollectionSchema({
  name: 'spike-test',
  vectors: {
    name: 'vec',
    dataType: ZVecDataType.VECTOR_FP32,
    dimension: 4,
    indexParams: { indexType: ZVecIndexType.HNSW, metricType: ZVecMetricType.COSINE },
  },
});

const col = ZVecCreateAndOpen('/tmp/zvec-spike-test', schema);

// Insert
col.insertSync({ id: 'a', vectors: { vec: [0.1, 0.2, 0.3, 0.4] } });
// { ok: true, code: 'ZVEC_OK', message: '' }

// Query
const results = col.querySync({ fieldName: 'vec', vector: [0.1, 0.2, 0.3, 0.4], topk: 5 });
// [{ id: 'a', score: 1.0, vectors: {}, fields: {} }]

// Delete
col.deleteSync('a');
// { ok: true, code: 'ZVEC_OK', message: '' }

col.destroySync(); // cleans up disk
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@xenova/transformers` (v2/v3) | `@huggingface/transformers@next` (v4) | Feb 2026 | New package name; v4 rewrites C++ WebGPU runtime |
| `device: 'wasm'` for browser CPU | `device: 'cpu'` for Node.js CPU | v3 → v4 | Node.js uses native ONNX bindings, not WASM |
| Xenova/model-name repos | Official model repos (jinaai/, nomic-ai/) | Ongoing | Xenova repos increasingly gated; official repos have ONNX weights |
| `vectordb` npm package | `@lancedb/lancedb` npm package | 2024-2025 | Old package deprecated; use new scoped package |

**Deprecated/outdated:**
- `@xenova/transformers`: Superseded by `@huggingface/transformers`; keep using the latter
- `vectordb` (LanceDB's old npm package): Deprecated; use `@lancedb/lancedb`

## Open Questions

1. **Zvec `ZVecOpen` on existing schema compatibility**
   - What we know: `ZVecOpen` opens without providing a schema; schema is read from disk
   - What's unclear: If schema evolves between versions, does it fail gracefully or corrupt?
   - Recommendation: Always use `isZVecError(err)` + error codes when opening; test schema
     evolution in Phase 2

2. **WebGPU model warmup time on first inference**
   - What we know: WebGPU inference works; model is downloaded and compiled on first call
   - What's unclear: How long does ONNX WebGPU shader compilation take for 768-dim models?
   - Recommendation: Measure in Phase 1-02 spike; if slow, consider pre-warming at startup

3. **Zvec `optimizeSync` necessity and timing**
   - What we know: `optimizeSync` improves index performance; the TypeScript types show it exists
   - What's unclear: Whether initial HNSW index is query-ready without calling `optimizeSync`,
     or if you must call it before queries will return good results
   - Recommendation: Test in the spike: insert docs, query without optimize, compare to with optimize

4. **`@huggingface/transformers` v4 stable release timeline**
   - What we know: Current version is `4.0.0-next.4` (next tag); `3.8.1` is latest stable
   - What's unclear: Whether `@next` API will change before stable release
   - Recommendation: Pin to `4.0.0-next.4` in package.json to avoid unexpected updates

## Sources

### Primary (HIGH confidence)
- Package contents of `@zvec/zvec@0.2.0` — TypeScript types read directly from `package/src/index.d.ts`
- Live execution on NixOS target machine — all Zvec CRUD operations and Transformers.js inference confirmed
- `npm show @zvec/zvec --json` — version metadata, platform dependencies, repository
- `npm show @zvec/bindings-linux-x64@0.2.0 --json` — binary package structure, file size (70MB)

### Secondary (MEDIUM confidence)
- [Transformers.js v4 blog post](https://huggingface.co/blog/transformersjs-v4) — v4 feature overview, installation instructions
- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/en/guides/webgpu) — `device: 'webgpu'` API (v3 docs, v4 compatible)
- [Zvec GitHub README](https://github.com/alibaba/zvec/blob/main/README.md) — platform support, npm package name
- [DeepWiki backend architecture](https://deepwiki.com/huggingface/transformers.js/8.2-backend-architecture) — Node.js vs WebGPU vs WASM backend selection

### Tertiary (LOW confidence)
- [MarkTechPost Zvec article](https://www.marktechpost.com/2026/02/10/alibaba-open-sources-zvec-an-embedded-vector-database-bringing-sqlite-like-simplicity-and-high-performance-on-device-rag-to-edge-applications/) — community overview, performance claims unverified
- [ONNX Runtime WebGPU issue #22077](https://github.com/microsoft/onnxruntime/issues/22077) — native WebGPU EP gap on Linux (informational)

## Metadata

**Confidence breakdown:**
- Zvec API: HIGH — TypeScript types read directly from package, all operations executed on target
- WebGPU on NixOS: HIGH — confirmed working with vulkan-loader, confirmed failing without it
- CPU fallback: HIGH — confirmed working, no extra deps needed
- Model IDs (jinaai, nomic-ai): HIGH — ONNX weights presence verified via HF API
- Transformers.js v4 API stability: MEDIUM — `@next` tag means pre-release; API could change

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days; zvec is moving fast, check for v0.3.0 before planning ends)
