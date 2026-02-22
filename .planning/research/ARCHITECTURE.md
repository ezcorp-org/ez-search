# Architecture Research

**Domain:** Local semantic search CLI tool
**Researched:** 2026-02-22
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │  index    │  │  query   │  │  status  │  (commander commands) │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                       │
│       │              │             │                              │
├───────┴──────────────┴─────────────┴─────────────────────────────┤
│                      Orchestration Layer                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  Pipeline Coordinator                       │  │
│  │  (wires together: scanner → chunker → embedder → store)    │  │
│  └────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│                       Core Services                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐     │
│  │  File    │  │ Chunker  │  │  Model   │  │  Vector DB   │     │
│  │ Scanner  │  │ (3 modes)│  │  Router  │  │  (Zvec)      │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘     │
│       │              │             │               │              │
├───────┴──────────────┴─────────────┴───────────────┴─────────────┤
│                       Infrastructure                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐     │
│  │ Manifest │  │  Ignore  │  │  xxHash  │  │  Path Utils  │     │
│  │  Cache   │  │  Parser  │  │  (WASM)  │  │ (.ez-search) │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘     │
└──────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   .ez-search/      │
                    │  ├── db/           │
                    │  └── manifest.json │
                    └───────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CLI Commands | Parse args, validate input, invoke pipeline, format output | commander with typed option interfaces |
| Pipeline Coordinator | Wire services together for index/query flows; manage batching | Async generator pipeline or sequential orchestration function |
| File Scanner | Walk directory tree, respect ignore patterns, collect file paths by type | `fs/promises` + `ignore` package, recursive readdir |
| Chunker | Split content into embeddable chunks with metadata | 3 strategies: AST-aware (code), sliding window (text), image preprocessing (CLIP) |
| Model Router | Lazy-load correct ONNX model by file type, cache loaded models | `@huggingface/transformers` pipeline factory with singleton map |
| Vector DB | Init collections, insert embeddings with metadata, cosine query | `@zvec/zvec` wrapper with per-dimension-size collections |
| Manifest Cache | Track file hashes/mtime/size, determine what needs re-indexing | JSON file at `.ez-search/manifest.json` |
| Ignore Parser | Parse `.gitignore` and `.cursorignore` into path matchers | `ignore` npm package |
| xxHash | Fast non-cryptographic hashing for content change detection | `xxhash-wasm` with one-time WASM init |
| Path Utils | Resolve `.ez-search/db/`, `manifest.json`, normalize paths | Pure utility functions |

## Recommended Project Structure

```
src/
├── cli.ts                 # Commander program setup, command registration
├── commands/
│   ├── index.ts           # Index command handler (orchestrates the pipeline)
│   └── query.ts           # Query command handler (embed query → search → format)
├── models/
│   └── router.ts          # Lazy model loading, model cache, type→model mapping
├── indexer/
│   ├── scanner.ts         # Directory traversal, file type classification
│   ├── chunker.ts         # Chunking dispatcher (code/text/image strategies)
│   ├── code-chunker.ts    # AST-aware code chunking (tree-sitter or regex)
│   ├── text-chunker.ts    # Sliding window text chunking with overlap
│   ├── image-preprocess.ts # CLIP image preprocessing
│   └── hasher.ts          # xxhash-wasm init, fs.stat checks, content hashing
├── db/
│   └── zvec.ts            # Zvec wrapper: init, insert, query, cleanup
├── cache/
│   └── manifest.ts        # Read/write/diff manifest.json, determine stale files
└── utils/
    ├── paths.ts           # .ez-search directory resolution
    ├── ignore.ts          # .gitignore + .cursorignore parsing
    └── types.ts           # Shared type definitions
```

### Structure Rationale

- **commands/:** Each CLI command is its own module that acts as an orchestrator, calling into core services. Keeps commander handler code thin.
- **models/:** Isolated because model loading is expensive and lazy. The router is a singleton that caches loaded models across operations.
- **indexer/:** Groups all "data preparation" work: finding files, classifying them, splitting them into chunks, and checking if they've changed.
- **db/:** Thin wrapper around Zvec. Isolating this makes it replaceable if Zvec proves problematic.
- **cache/:** Separated from indexer because the manifest is read/written independently and persists between runs.
- **utils/:** Pure functions with no side effects. No imports from other src/ modules.

## Architectural Patterns

### Pattern 1: Lazy Singleton Model Registry

**What:** Models are loaded on first use and cached for the session. A registry maps file type categories to model configurations. Only the model(s) needed for the current operation are loaded.
**When to use:** Always. Loading all three models eagerly would blow cold-start time past 1.5s and waste VRAM.
**Trade-offs:** First query/index per model type has latency; subsequent ones are instant. Slightly more complex than eager loading.

**Example:**
```typescript
type ModelType = 'code' | 'text' | 'image';

const MODEL_CONFIG: Record<ModelType, { model: string; task: string }> = {
  code:  { model: 'Xenova/jina-embeddings-v2-base-code', task: 'feature-extraction' },
  text:  { model: 'Xenova/nomic-embed-text-v1.5',        task: 'feature-extraction' },
  image: { model: 'Xenova/clip-vit-base-patch32',         task: 'feature-extraction' },
};

const loaded = new Map<ModelType, Pipeline>();

async function getModel(type: ModelType): Promise<Pipeline> {
  if (!loaded.has(type)) {
    loaded.set(type, await pipeline(MODEL_CONFIG[type].task, MODEL_CONFIG[type].model, {
      device: 'webgpu',
      dtype: 'fp32',
    }));
  }
  return loaded.get(type)!;
}
```

### Pattern 2: Hash-Check-Then-Embed (Incremental Indexing)

**What:** A two-tier change detection system. First tier: compare `mtime` and `size` from `fs.stat` against manifest (zero I/O beyond stat). Second tier: if stat changed, compute xxHash of file content and compare against manifest hash. Only re-embed if content actually changed.
**When to use:** Every index run after the first.
**Trade-offs:** Manifest file grows linearly with indexed file count. For 10k files, manifest is ~1-2MB JSON, which is fine.

**Example:**
```typescript
interface ManifestEntry {
  size: number;
  mtime: number;
  hash: string;    // xxHash h64
  chunks: number;  // how many chunks this file produced
}

type Manifest = Record<string, ManifestEntry>; // keyed by relative path

function fileStatus(path: string, stat: Stats, manifest: Manifest): 'unchanged' | 'check-hash' | 'new' {
  const entry = manifest[path];
  if (!entry) return 'new';
  if (entry.size === stat.size && entry.mtime === stat.mtimeMs) return 'unchanged';
  return 'check-hash'; // stat changed, need to verify content
}
```

### Pattern 3: Batched Embedding Pipeline

**What:** Chunks are collected into batches of N (32 per PRD) and sent to the model together. This maximizes GPU utilization without OOM. The pipeline is: scan -> chunk -> batch -> embed -> store, with backpressure between stages.
**When to use:** All embedding operations. Single-item inference wastes GPU parallelism.
**Trade-offs:** Adds batching complexity. Last batch may be partial (not a problem, just handle it).

**Example:**
```typescript
async function* batchEmbed(
  chunks: AsyncIterable<Chunk>,
  model: Pipeline,
  batchSize = 32
): AsyncGenerator<{ chunk: Chunk; embedding: Float32Array }[]> {
  let batch: Chunk[] = [];
  for await (const chunk of chunks) {
    batch.push(chunk);
    if (batch.length >= batchSize) {
      const embeddings = await model(batch.map(c => c.text));
      yield batch.map((c, i) => ({ chunk: c, embedding: embeddings[i] }));
      batch = [];
    }
  }
  if (batch.length > 0) {
    const embeddings = await model(batch.map(c => c.text));
    yield batch.map((c, i) => ({ chunk: c, embedding: embeddings[i] }));
  }
}
```

### Pattern 4: Type-Dispatched Chunking

**What:** A dispatcher inspects file type and delegates to the appropriate chunking strategy. Code files use AST-aware chunking (or regex-based function/class boundary detection). Text files use sliding window with token-based overlap. Images bypass text chunking entirely and go through CLIP preprocessing.
**When to use:** During indexing, after file scanning classifies each file.
**Trade-offs:** Three chunking strategies to maintain. But each is simple individually.

## Data Flow

### Index Flow

```
ez-search index <dir> [--type code|text|image] [--clear]
    │
    ▼
[CLI Parser] ── validates args, resolves paths
    │
    ▼
[File Scanner] ── walks dir, applies ignore rules
    │              classifies files by extension → type
    │              returns: FileEntry[]
    ▼
[Manifest Diff] ── loads .ez-search/manifest.json
    │                compares stat/hash for each file
    │                returns: { new: [], changed: [], unchanged: [], deleted: [] }
    ▼
[Handle Deletes] ── removes vectors for deleted files from Zvec
    │
    ▼
[Chunker Dispatch] ── for each new/changed file:
    │                    code → AST-aware chunker (~500 tokens, 50 overlap)
    │                    text → sliding window chunker (~500 tokens, 50 overlap)
    │                    image → CLIP preprocessor (resize/crop)
    │                    each chunk carries: { text, filepath, startLine, endLine }
    ▼
[Model Router] ── lazy-loads model for the file type (if not cached)
    │
    ▼
[Batch Embedder] ── groups chunks into batches of 32
    │                 runs inference via WebGPU
    │                 returns: { embedding: Float32Array, metadata }[]
    ▼
[Zvec Insert] ── inserts embeddings + metadata into .ez-search/db/
    │
    ▼
[Update Manifest] ── writes updated manifest.json with new hashes
    │
    ▼
[Report] ── prints summary: X files indexed, Y skipped, Z deleted
```

### Query Flow

```
ez-search query "<search_string>" [--dir .] [--type code] [--top-k 10]
    │
    ▼
[CLI Parser] ── validates args, checks .ez-search/ exists
    │
    ▼
[Model Router] ── lazy-loads model matching --type (or auto-detect)
    │
    ▼
[Embed Query] ── single inference call, returns query vector
    │
    ▼
[Zvec Query] ── cosine similarity search, top-k results
    │              returns: { score, metadata }[]
    ▼
[Format Output] ── machine-readable lines:
                    File: <path> | Lines: <start>-<end> | Relevance: <score>
```

### Key Data Flows

1. **File-to-Vector (Index):** File on disk -> stat check -> hash check -> read content -> chunk -> embed (WebGPU batch) -> store in Zvec + update manifest
2. **Query-to-Results:** Query string -> embed (WebGPU single) -> Zvec cosine search -> format and print
3. **Incremental Skip:** File on disk -> stat check -> manifest match -> skip (no I/O beyond stat)

## Scaling Considerations

This is a local CLI tool, not a server. "Scale" means larger codebases, not more users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| < 1k files | No special handling needed. Index completes in seconds. |
| 1k-10k files | Incremental indexing is essential. Manifest diffing saves 95%+ of work on re-index. Batched GPU inference keeps VRAM bounded. |
| 10k-100k files | Manifest JSON starts getting large (10-100MB). Consider streaming JSON parse or switching to SQLite for manifest. Scanner parallelism matters. |
| 100k+ files | Likely need to partition Zvec collections. Manifest must be a database, not JSON. Consider parallel file hashing. |

### Scaling Priorities

1. **First bottleneck: Initial index time.** Embedding is the slowest step. Batch size tuning and WebGPU warmup matter most. For 10k files with ~500 token chunks, expect ~50k chunks. At batch-32 that's ~1,500 inference calls.
2. **Second bottleneck: Manifest I/O.** For very large codebases, reading/writing a large JSON manifest becomes slow. A SQLite manifest would solve this but adds complexity — defer unless needed.
3. **Third bottleneck: Zvec query time.** For 100k+ vectors, query time depends on Zvec's indexing strategy. If it uses brute-force, may need to switch to HNSW or similar.

## Anti-Patterns

### Anti-Pattern 1: Eager Model Loading

**What people do:** Load all three models (Jina, Nomic, CLIP) at startup to have them "ready."
**Why it's wrong:** Each model is 100-400MB. Loading three models uses 1GB+ VRAM and takes 5-15 seconds. Most operations only need one model.
**Do this instead:** Lazy-load on first use with a singleton cache. Only the needed model loads.

### Anti-Pattern 2: One-at-a-Time Embedding

**What people do:** Call the model for each chunk individually.
**Why it's wrong:** GPU inference has high per-call overhead. Single-item calls waste 90%+ of GPU throughput.
**Do this instead:** Batch chunks (32 at a time per PRD) and embed the whole batch in one call.

### Anti-Pattern 3: Rehashing Everything on Every Index

**What people do:** Skip the `fs.stat` fast check and hash every file on every run.
**Why it's wrong:** For 10k files, reading + hashing all of them takes seconds. With stat-first, most files are skipped in milliseconds (stat is a kernel call, no file I/O).
**Do this instead:** Two-tier: stat check first (mtime + size), hash only if stat changed.

### Anti-Pattern 4: Single Monolithic Vector Collection

**What people do:** Put code, text, and image embeddings in one Zvec collection.
**Why it's wrong:** Different models produce different embedding dimensions (768 for Jina/Nomic, 512 for CLIP). Cosine similarity across different embedding spaces is meaningless.
**Do this instead:** Separate collections per model type. Query routes to the correct collection.

### Anti-Pattern 5: Tight Coupling Between CLI and Business Logic

**What people do:** Put all indexing logic directly in the commander action handler.
**Why it's wrong:** Untestable. Can't reuse indexing logic outside CLI. Hard to add new commands.
**Do this instead:** CLI handlers are thin wrappers that parse args and call into service functions. All real logic lives in `indexer/`, `models/`, `db/`, etc.

### Anti-Pattern 6: Not Handling Deleted Files

**What people do:** Only track new/changed files, never remove stale vectors.
**Why it's wrong:** Deleted or renamed files leave orphan vectors in the DB, returning results that point to nonexistent files.
**Do this instead:** Manifest diff identifies deleted files. Remove their vectors from Zvec before inserting new ones.

## Integration Points

### External Dependencies

| Dependency | Integration Pattern | Notes |
|-----------|---------------------|-------|
| `@huggingface/transformers` | `pipeline()` factory → lazy singleton | WebGPU device selection, fp32 dtype. Models auto-download to HF cache on first use. |
| `@zvec/zvec` | Direct API calls via wrapper | In-process C++ addon. Collection init with dimension + metric params. |
| `xxhash-wasm` | One-time WASM init → `h64ToString()` | Init once at startup, reuse across all file hash calls. |
| `ignore` | Load `.gitignore` content → `ignore().add(rules)` | Compose multiple ignore files (.gitignore, .cursorignore). |
| `commander` | `.command()` + `.action()` registration | v12+ for Node 20+ compatibility. |
| `ora` | Spinner for long operations (index) | Start before pipeline, stop on completion/error. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI commands <-> Services | Direct function calls with typed args | Commands import and call service functions. No event bus needed. |
| Scanner <-> Chunker | Scanner returns `FileEntry[]`, Chunker consumes them | Chunker doesn't know about filesystem traversal. |
| Chunker <-> Model Router | Chunker produces `Chunk[]`, Router provides `Pipeline` | Decoupled: chunker doesn't know which model embeds its output. |
| Model Router <-> Zvec | Router produces `Float32Array[]`, Zvec stores them | Zvec doesn't know about models. It receives vectors + metadata. |
| Manifest <-> Scanner | Manifest provides "what changed" filter for scanner results | Scanner finds all files; manifest filters to only changed ones. |

## Build Order (Dependency Graph)

Components should be built bottom-up. Infrastructure first, then services, then orchestration, then CLI.

```
Phase 1: Foundation (no inter-dependencies)
  ├── utils/paths.ts        (pure functions, no deps)
  ├── utils/types.ts         (type definitions)
  ├── utils/ignore.ts        (wraps 'ignore' package)
  └── indexer/hasher.ts      (wraps xxhash-wasm)

Phase 2: Core Services (depend on Phase 1)
  ├── cache/manifest.ts      (depends on: types, paths, hasher)
  ├── models/router.ts       (depends on: types)
  ├── db/zvec.ts             (depends on: types, paths)
  └── indexer/scanner.ts     (depends on: types, paths, ignore)

Phase 3: Processing (depends on Phase 2)
  ├── indexer/code-chunker.ts    (depends on: types)
  ├── indexer/text-chunker.ts    (depends on: types)
  ├── indexer/image-preprocess.ts (depends on: types)
  └── indexer/chunker.ts          (dispatcher, depends on: above three)

Phase 4: Commands (orchestrate Phase 2+3)
  ├── commands/index.ts      (wires: scanner → manifest → chunker → router → zvec)
  └── commands/query.ts      (wires: router → zvec → formatter)

Phase 5: CLI Entry Point
  └── cli.ts                 (registers commands from Phase 4)
```

**Why this order:**
- Phase 1 has zero internal dependencies and can be built/tested in isolation
- Phase 2 components each wrap one external dependency (xxhash, transformers.js, zvec, ignore)
- Phase 3 is pure data transformation (text in, chunks out)
- Phase 4 is integration: it wires together Phase 2+3 components into workflows
- Phase 5 is just commander boilerplate that delegates to Phase 4

Each phase is independently testable before moving to the next.

## Sources

- [obra/episodic-memory (similar local semantic search architecture)](https://deepwiki.com/obra/episodic-memory)
- [CocoIndex: codebase indexing with tree-sitter and incremental processing](https://cocoindexio.substack.com/p/index-codebase-with-tree-sitter-and)
- [Supermemory code-chunk: AST-aware code chunking](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/)
- [Firecrawl: Best chunking strategies for RAG 2025](https://www.firecrawl.dev/blog/best-chunking-strategies-rag-2025)
- [LanceDB: Building RAG on codebases](https://lancedb.com/blog/building-rag-on-codebases-part-1/)
- [CocoIndex incremental indexing architecture](https://medium.com/@cocoindex.io/building-a-real-time-data-substrate-for-ai-agents-the-architecture-behind-cocoindex-729981f0f3a4)
- [Commander.js GitHub](https://github.com/tj/commander.js)
- [Pinecone: Chunking strategies](https://www.pinecone.io/learn/chunking-strategies/)

---
*Architecture research for: ez-search (local semantic search CLI)*
*Researched: 2026-02-22*
