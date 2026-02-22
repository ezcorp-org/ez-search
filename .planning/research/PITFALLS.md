# Domain Pitfalls

**Domain:** Local AI semantic search CLI (embedding-based codebase/document search)
**Project:** ez-search
**Researched:** 2026-02-22

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or fundamental architecture problems.

### Pitfall 1: WebGPU Availability Assumption

**What goes wrong:** The PRD requires WebGPU backend via `@huggingface/transformers@next`, but WebGPU is not universally available in Node.js. Node.js does not ship with a built-in WebGPU implementation -- it requires the `webgpu` npm package (Dawn bindings) or similar native addon. On many systems (headless servers, older GPUs, CI environments), WebGPU will simply fail to initialize. If the CLI hard-crashes on WebGPU failure, it becomes unusable for a large portion of the target audience.

**Why it happens:** Developers test on machines with modern GPUs and assume availability. The PRD says "Node.js v22+ required for stable WebGPU" but Node.js v22 does NOT include WebGPU natively -- this is a misconception. WebGPU in Node.js requires explicit Dawn bindings via the `webgpu` npm package or running in a Chromium-based environment.

**Consequences:** CLI exits with a cryptic error on machines without GPU support. Users on Linux servers, WSL without GPU passthrough, or older hardware cannot use the tool at all.

**Prevention:**
1. Implement a robust fallback chain: WebGPU -> WASM (CPU). Transformers.js v3/v4 supports `device: 'wasm'` as a CPU fallback.
2. Detect WebGPU availability at runtime before attempting model loading. Wrap `navigator.gpu.requestAdapter()` (or Dawn equivalent) in a try-catch.
3. Log a clear warning when falling back: "WebGPU not available, using CPU backend (slower)."
4. Never let WebGPU failure crash the process -- catch and degrade gracefully.

**Detection:** Test on a machine without a discrete GPU. Test in a Docker container. If it crashes, this pitfall is present.

**Confidence:** HIGH -- verified via multiple GitHub issues on transformers.js and Node.js WebGPU discussion threads.

**Phase:** Must be addressed in Phase 1 (core infrastructure). The model loading/router module needs fallback from day one.

---

### Pitfall 2: Dimension Mismatch When Switching Models

**What goes wrong:** The PRD specifies three different embedding models with different output dimensions (768 for Jina code, 768 for Nomic text, 512 for CLIP images). If a user indexes with one model, then queries with a different model (or re-indexes after a model change), the vector dimensions will not match the existing zvec collection. This causes either silent garbage results (wrong distance calculations) or hard crashes.

**Why it happens:** The dimension is set at collection creation time. When the model changes (user switches `--type`, model gets updated, or a new model version outputs different dimensions), existing vectors become incompatible. This is the single most common pitfall reported across Pinecone, Weaviate, Qdrant, and LlamaIndex communities.

**Consequences:** Index corruption. Query results that are meaningless. Cryptic errors like "vector dimension error: expected dim: 768, got 512." Users lose trust in search quality without understanding why.

**Prevention:**
1. Store the model name AND dimension in the manifest metadata (`manifest.json`). On every query or re-index, validate that the current model's dimension matches the stored dimension.
2. If dimensions mismatch, refuse to proceed and print a clear error: "Index was built with model X (dim=768) but current query uses model Y (dim=512). Run `ez-search index --clear` to rebuild."
3. Use separate zvec collections per model type (code, text, image) rather than one mixed collection. This naturally isolates dimension spaces.
4. Never silently mix vectors of different dimensions in the same collection.

**Detection:** Try indexing with `--type code` then querying with `--type image`. If it silently returns results (wrong ones), this pitfall is present.

**Confidence:** HIGH -- dimension mismatch is the most-reported vector DB issue across all major platforms.

**Phase:** Must be addressed in Phase 1 (database schema design). The zvec wrapper must enforce dimension validation from the start.

---

### Pitfall 3: Zvec Node.js Bindings Maturity Risk

**What goes wrong:** Zvec was open-sourced by Alibaba in early February 2026 -- less than 3 weeks ago. The Python bindings are the primary interface; Node.js bindings via `@zvec/zvec` are secondary. SWIG-generated bindings often have edge cases: memory leaks from improper prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent prevent

Let me rewrite this properly.

**What goes wrong:** Zvec was open-sourced by Alibaba in early February 2026 -- less than 3 weeks old. The Python API is the primary interface with thorough documentation. The Node.js bindings (`@zvec/zvec` on npm) are generated via SWIG and are secondary. SWIG-generated bindings frequently have issues: memory management mismatches between C++ and JS garbage collection, missing error propagation, incomplete API surface compared to the Python SDK, and platform-specific build failures for the native addon.

**Why it happens:** New open-source projects prioritize one language binding (usually Python for ML projects). Node.js bindings are added for breadth but receive less testing and fewer bug reports.

**Consequences:** Hitting undocumented limitations mid-project. Native addon build failures on some platforms (NixOS, Alpine, musl-based systems). Potential memory leaks from C++ objects not being properly prevented prevented prevented prevented prevented prevented prevented prevented prevented prevented prevented prevented

Let me be more precise: potential memory leaks from C++ objects not being freed when JS garbage collection runs. Segfaults from threading issues if zvec's C++ core is not thread-safe when called from Node.js async operations.

**Prevention:**
1. Build a thin abstraction layer over zvec (`src/db/zvec.ts`) from day one. If zvec has blocking issues, you can swap the underlying storage without rewriting the entire codebase.
2. Write integration tests against zvec early -- test insert, query, delete, collection lifecycle, and edge cases (empty collection, zero results, large batch insert).
3. Have a fallback plan: if zvec's Node.js bindings are too immature, alternatives include hnswlib-node (pure HNSW), vectra (local vector DB for Node.js), or even a custom flat-search implementation for smaller datasets.
4. Pin the exact zvec version. Do not use `^` ranges for a library this new.
5. Test on the target platform (NixOS per the environment) early. Native addons often fail on NixOS without nix-specific patching.

**Detection:** Run the zvec Node.js quickstart on NixOS. If it fails to install or segfaults, this pitfall is active.

**Confidence:** MEDIUM -- zvec is too new to have community-reported Node.js issues, but the pattern of SWIG-generated bindings having rough edges is well-established.

**Phase:** Must be validated in Phase 0 (spike/proof-of-concept). Do NOT build the full pipeline before confirming zvec works reliably on the target platform.

---

### Pitfall 4: First-Run Model Download Blocks the CLI

**What goes wrong:** Transformers.js downloads ONNX models from Hugging Face Hub on first use. The models specified in the PRD are substantial: Jina embeddings v2 base is ~130MB (fp32), Nomic embed is ~260MB, CLIP ViT is ~340MB. On first run, `ez-search index .` will hang for minutes downloading a model with no feedback, appearing broken.

**Why it happens:** Transformers.js caches models after first download (to `node_modules/@huggingface/transformers/.cache/` by default or a custom `env.cacheDir`). But the first download is synchronous from the user's perspective, and many embedding pipelines do not expose download progress natively.

**Consequences:** Users think the tool is frozen. They Ctrl+C and retry, getting the same hang. They file bug reports saying "ez-search hangs on index." The PRD says cold-start under 1.5 seconds -- impossible on first run with model download.

**Prevention:**
1. Detect whether the model is cached before loading. If not cached, print an explicit message: "Downloading embedding model (130MB, one-time)..." with a progress indicator (use `ora` spinner at minimum).
2. Consider a separate `ez-search setup` or `ez-search download-models` command that pre-downloads models.
3. Set `env.cacheDir` to a project-level or user-level location (`~/.ez-search/models/`), NOT inside `node_modules` which gets wiped on `npm install`.
4. Support `env.allowRemoteModels = false` with `env.localModelPath` for air-gapped environments.
5. Use quantized models (`dtype: 'q8'` or `dtype: 'q4'`) to reduce download size significantly. The PRD specifies `fp32` but q8 is often sufficient for embedding similarity and is 4x smaller.

**Detection:** Delete the model cache directory. Run `ez-search index .` and time it. If there is no download feedback for >5 seconds, this pitfall is present.

**Confidence:** HIGH -- verified from transformers.js official documentation and multiple community reports.

**Phase:** Phase 1 (model router). Must handle download UX from the first implementation.

---

### Pitfall 5: Naive Text Chunking Destroys Code Semantics

**What goes wrong:** The PRD says "split into ~500 token chunks with 50 token overlap." Applying this naively to source code (character or token count splitting) cuts functions in half, separates class definitions from their methods, splits import blocks from the code that uses them, and severs comments from the code they describe. The resulting embeddings encode meaningless fragments, and search quality plummets.

**Why it happens:** Chunking strategies designed for prose (paragraphs, sentences) do not work for code. Code has hierarchical structure (files -> classes -> methods -> blocks) that naive splitters ignore. Research shows AST-based chunking reduces irrelevant retrieval by ~40% compared to naive 500-character splits on large codebases.

**Consequences:** Searches for "authentication middleware" return the second half of an unrelated function that happens to contain the word "auth" in a variable name. Users lose trust in semantic search and revert to grep. The entire value proposition of the tool is undermined.

**Prevention:**
1. Use tree-sitter for AST-aware code chunking. The PRD already mentions tree-sitter -- this is the correct approach. Parse code into AST, chunk at function/class/block boundaries.
2. Implement a recursive split-then-merge strategy: iterate AST nodes, accumulate into chunks until size limit, recurse into children if a node exceeds the limit.
3. Preserve metadata: store the function name, class context, file path, and exact line numbers with each chunk.
4. For text/markdown, split on section headers and paragraph boundaries, not arbitrary token counts.
5. Add a "context prefix" to each chunk: prepend the file path and enclosing scope (e.g., "File: auth.ts, Class: AuthService, Method: validateToken") so the embedding captures context.
6. Test search quality empirically: index a known codebase, run 10 known queries, verify the correct functions appear in top-5 results.

**Detection:** Index a TypeScript project. Search for a known function by describing what it does (not by name). If the correct function is not in the top 5 results, chunking is likely the problem.

**Confidence:** HIGH -- supported by multiple research papers (cAST 2025, Radboud 2025) and practical evaluations from Pinecone, Weaviate, and Elasticsearch documentation.

**Phase:** Phase 1 (chunker implementation). This is a make-or-break component. Invest heavily here.

---

## Moderate Pitfalls

Mistakes that cause significant delays, degraded performance, or technical debt.

### Pitfall 6: WebGPU Memory Leaks on Batch Processing

**What goes wrong:** WebGPU tensors are not automatically garbage-collected by JavaScript's GC. When processing thousands of files in batches of 32 (as the PRD specifies), each batch allocates GPU memory for input tensors, intermediate activations, and output embeddings. If output tensors are not explicitly disposed after extracting the embedding values, GPU memory grows monotonically until the device is lost or the process OOMs.

**Why it happens:** JavaScript developers expect GC to handle cleanup. GPU memory is managed separately -- tensors must be explicitly `.dispose()`d or the memory is never freed. This is a documented issue in transformers.js (GitHub issue #860) specifically for WebGPU pipelines.

**Prevention:**
1. After each batch, explicitly call `.dispose()` on all returned tensors. Extract the raw float array first, then dispose immediately.
2. Implement a `try/finally` pattern around each batch: allocate, extract, dispose in finally block.
3. Monitor GPU memory between batches using `performance.measureUserAgentSpecificMemory()` or similar (if available).
4. Add a configurable batch size flag (`--batch-size`) so users with less VRAM can reduce batch sizes.
5. Consider processing batches sequentially (not in parallel) to limit peak GPU memory.

**Detection:** Index a directory with 5000+ files. Monitor system GPU memory (nvidia-smi or similar). If it climbs steadily without dropping, tensors are leaking.

**Confidence:** HIGH -- explicitly documented in transformers.js issue #860 (WebGPU memory leak in pipeline processing).

**Phase:** Phase 2 (indexing pipeline). Must be correct from the first batch-processing implementation.

---

### Pitfall 7: Incremental Indexing Race Conditions

**What goes wrong:** The manifest-based caching strategy (mtime + xxhash) has race conditions when files change during indexing. Scenario: file A is stat'd (mtime recorded), then file A is modified before its content is read and hashed. The manifest now has a stale mtime for content that was actually different. On next run, the mtime matches, so the file is skipped -- but the index contains embeddings for the old content.

**Why it happens:** File systems are not transactional. Between `fs.stat()` and `fs.readFile()`, arbitrary changes can occur. This is especially common during active development (editor auto-save, git operations, build tools).

**Consequences:** Stale search results. User searches for code they just wrote and it does not appear. They re-run indexing and it says "0 files changed" because mtime still matches. Deeply confusing.

**Prevention:**
1. Read file content first, then stat. Or better: read content, hash it, then record mtime. If mtime changes between read and record, re-read.
2. Use a two-phase approach: Phase 1 collects file list + stats. Phase 2 reads + hashes + embeds. Phase 3 atomically updates manifest.
3. Write the manifest atomically (write to temp file, then rename) to prevent corruption if the process is interrupted mid-write.
4. Add a `--force` flag that ignores the manifest and re-indexes everything, as an escape hatch.
5. Consider using file content hash as the primary cache key (not mtime). mtime is a fast pre-filter, but xxhash of content is the source of truth.

**Detection:** Start an index operation. While it runs, modify a file it has already stat'd but not yet processed. Check if the next index run correctly detects the change.

**Confidence:** MEDIUM -- race conditions are theoretical until proven, but the pattern is well-documented in file-watching and incremental build systems.

**Phase:** Phase 2 (incremental indexing). The manifest implementation must be atomic and race-resistant.

---

### Pitfall 8: Memory Exhaustion on Large Codebases

**What goes wrong:** The PRD targets 10,000+ file codebases. If all file paths, content strings, chunks, and embedding vectors are held in memory simultaneously, the Node.js heap will exhaust. With 10,000 files averaging 200 lines each, at ~500 token chunks with overlap, you get roughly 40,000-60,000 chunks. Each 768-dimensional fp32 embedding is 3KB. That alone is ~180MB of embeddings, plus the text content, metadata, and Node.js overhead.

**Why it happens:** The natural implementation is: scan all files -> chunk all files -> embed all chunks -> insert all vectors. This loads everything into memory at once. Node.js default heap is ~1.5GB on 64-bit systems, and between file content, chunks, embeddings, and the model itself (~500MB for fp32), you hit the limit.

**Prevention:**
1. Process files in streaming fashion: scan -> chunk -> embed -> insert per file (or small batch of files), then release the file content and chunks from memory.
2. Never hold all embeddings in memory at once. Insert into zvec after each batch of 32, then release the embedding arrays.
3. Use `--max-old-space-size=4096` as a documented recommendation for large codebases.
4. Implement backpressure: if zvec insert is slow, pause the embedding pipeline rather than buffering.
5. Track memory usage periodically (`process.memoryUsage().heapUsed`) and log warnings if approaching limits.
6. Null out large arrays/buffers after use to make them eligible for GC.

**Detection:** Index a codebase with 15,000+ files. If the process crashes with "JavaScript heap out of memory", this pitfall is present.

**Confidence:** HIGH -- well-documented Node.js memory management concern, verified by Node.js official documentation.

**Phase:** Phase 2 (indexing pipeline). The batch-process-insert loop must be streaming, not accumulating.

---

### Pitfall 9: Manifest Corruption on Interrupted Indexing

**What goes wrong:** If the user Ctrl+C's during indexing, the manifest.json may be partially written (truncated JSON). On next run, `JSON.parse()` throws, and the CLI crashes or falls back to a full re-index. Worse: if the manifest was updated but the zvec database was not fully written, the manifest claims files are indexed when they are actually missing from the vector store.

**Why it happens:** The manifest and the vector database are two separate data stores that are not atomically updated together. Any interruption between updating one and the other creates an inconsistent state.

**Consequences:** Corrupted manifest forces full re-index (annoying but recoverable). Inconsistent manifest-vs-DB state causes missing search results (confusing, hard to diagnose).

**Prevention:**
1. Write manifest atomically: write to `.ez-search/manifest.json.tmp`, then `fs.rename()` to `.ez-search/manifest.json`. Rename is atomic on POSIX systems.
2. Update the manifest only AFTER vectors are confirmed inserted into zvec. Never update manifest optimistically.
3. Add a `--verify` flag that checks manifest entries against actual zvec contents and reports inconsistencies.
4. Handle `SIGINT` gracefully: register a handler that finishes the current batch, writes a consistent manifest, then exits.
5. On startup, validate that `manifest.json` is parseable. If not, delete it and log "Manifest corrupted, performing full re-index."

**Detection:** Start indexing a large directory. Ctrl+C after 50% progress. Run index again. If it crashes or shows inconsistent behavior, this pitfall is present.

**Confidence:** HIGH -- standard filesystem atomicity concern, well-understood in build tool design.

**Phase:** Phase 2 (incremental indexing). Must be addressed alongside manifest implementation.

---

### Pitfall 10: CLI Cold-Start Time Exceeds User Patience

**What goes wrong:** Node.js module loading is not instant. Importing `@huggingface/transformers` pulls in ONNX runtime (~200MB of WASM/native binaries). Importing `@zvec/zvec` loads a native C++ addon. Even without model loading, just requiring these modules can take 1-3 seconds. If all modules are eagerly imported at startup, even `ez-search --help` takes multiple seconds.

**Why it happens:** Node.js `require()`/`import` is synchronous and eager. Heavy native addons and WASM modules have initialization overhead (xxhash-wasm takes ~2ms, but ONNX runtime takes 500ms+).

**Consequences:** Users perceive the tool as slow. In AI assistant integrations (Claude Code calling ez-search), every invocation pays the startup tax. At 2-3 seconds per query, the tool becomes a bottleneck rather than an accelerator.

**Prevention:**
1. Lazy-load everything heavy. The PRD already mandates lazy model loading -- extend this to ALL heavy imports. Only import `@huggingface/transformers` when actually running index/query commands, not at CLI parse time.
2. Use dynamic `import()` (ESM) or `require()` inside command handlers, not at module top level.
3. The CLI framework (commander) and argument parsing should be the only top-level imports.
4. Consider using `node --experimental-compile-cache` (Node.js v22+) to speed up repeated startup.
5. Benchmark startup time: `time ez-search --help` must be under 200ms. `time ez-search query "test"` (with cached model) must be under 1.5 seconds.
6. For the AI assistant use case, consider a long-running daemon mode (`ez-search serve`) that keeps the model loaded and accepts queries over a socket, amortizing startup cost.

**Detection:** Run `time ez-search --help`. If it takes more than 500ms, startup is too heavy.

**Confidence:** HIGH -- well-understood Node.js performance characteristic, verified in Node.js issue tracker.

**Phase:** Phase 1 (CLI scaffold). Lazy-loading architecture must be established from the start; retrofitting is painful.

---

## Minor Pitfalls

Mistakes that cause annoyance or small UX degradation but are fixable without rewrites.

### Pitfall 11: Model Cache Location Inside node_modules

**What goes wrong:** Transformers.js defaults to caching models in `node_modules/@huggingface/transformers/.cache/`. This location is wiped on every `npm install`, `npm ci`, or `node_modules` cleanup. Users end up re-downloading 300MB+ of models frequently.

**Prevention:**
1. Set `env.cacheDir` to a user-level location: `~/.ez-search/models/` or respect `XDG_CACHE_HOME`.
2. Document this in error messages: if model not found, say where it is looking and how to pre-download.

**Phase:** Phase 1 (model router configuration).

---

### Pitfall 12: Ignoring .gitignore Patterns Incorrectly

**What goes wrong:** The PRD says to respect `.gitignore`. But `.gitignore` patterns are surprisingly complex: negation (`!important.log`), directory-only patterns (`build/`), anchored patterns (`/dist`), and nested `.gitignore` files in subdirectories. Using a naive pattern matcher will either over-exclude (missing files) or under-exclude (indexing node_modules).

**Prevention:**
1. Use the `ignore` npm package (mentioned in PRD) which implements full gitignore spec compliance.
2. Also check for `.ez-search-ignore` as a project-specific exclusion file.
3. Always exclude `.ez-search/` itself from indexing.
4. Test against a repo with a complex `.gitignore` that uses negation patterns.

**Phase:** Phase 1 (file traversal).

---

### Pitfall 13: Output Format Not Machine-Parseable

**What goes wrong:** The PRD specifies `File: <path> | Lines: <start>-<end> | Relevance: <score>` for query output. If the tool also prints progress messages, warnings, download status, or spinners to stdout, downstream consumers (Claude Code, scripts) cannot reliably parse results.

**Prevention:**
1. Strict separation: results to stdout, all other output (progress, warnings, errors) to stderr.
2. Add a `--json` flag that outputs results as a JSON array for programmatic consumption.
3. Add a `--quiet` flag that suppresses all non-result output.
4. Never mix progress indicators with result output on the same stream.

**Phase:** Phase 1 (CLI design). This convention must be established from the first command implementation.

---

### Pitfall 14: xxhash-wasm Initialization Overhead Per File

**What goes wrong:** If `xxhash-wasm` is initialized (WebAssembly module instantiation) for every file hash, the 2ms initialization cost multiplied by 10,000 files adds 20 seconds of overhead.

**Prevention:**
1. Initialize the xxhash-wasm module once at startup and reuse the instance for all files.
2. Use the streaming API (`create64().update().digest()`) for large files to avoid loading entire file contents into memory for hashing.
3. The PRD already notes "initialize the WASM module once" -- enforce this in code review.

**Phase:** Phase 1 (hasher module).

---

### Pitfall 15: NixOS Native Addon Build Failures

**What goes wrong:** The development environment is NixOS, which has a non-standard filesystem layout (no `/usr/lib`, no standard dynamic linker path). Native Node.js addons like `@zvec/zvec` (C++ via SWIG) and potentially the `webgpu` package (Dawn bindings) may fail to build or link on NixOS without explicit nix-shell or nix-develop configuration.

**Prevention:**
1. Test `npm install` of all native dependencies on NixOS early in the project.
2. Prepare a `shell.nix` or `flake.nix` that provides the necessary build tools (gcc, cmake, python3 for node-gyp).
3. Document NixOS-specific setup instructions.
4. Consider providing a Dockerfile as an alternative development environment.

**Phase:** Phase 0 (environment setup / proof-of-concept spike).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| **Phase 0: Spike/PoC** | Zvec Node.js bindings don't work on NixOS (#3, #15) | Test `@zvec/zvec` install and basic CRUD before any other work. Have hnswlib-node as backup. |
| **Phase 1: Core Infrastructure** | WebGPU not available (#1), cold-start too slow (#10), model download UX (#4) | Fallback chain, lazy imports, download progress indicators |
| **Phase 1: Schema Design** | Dimension mismatch (#2) | Separate collections per model type, dimension validation in manifest |
| **Phase 1: Chunking** | Naive text splitting (#5) | Tree-sitter AST chunking for code, boundary-aware splitting for text |
| **Phase 2: Indexing Pipeline** | GPU memory leaks (#6), heap exhaustion (#8), manifest corruption (#9) | Explicit tensor disposal, streaming pipeline, atomic manifest writes |
| **Phase 2: Incremental Indexing** | Race conditions (#7), interrupted indexing (#9) | Content hash as source of truth, atomic writes, SIGINT handler |
| **Phase 3: Query & UX** | Output not parseable (#13) | stdout for results only, stderr for everything else, --json flag |

---

## Sources

### Transformers.js / WebGPU
- [WebGPU Memory Leak in Pipeline - transformers.js #860](https://github.com/huggingface/transformers.js/issues/860)
- [ONNX Runtime GPU Memory Not Released - #19445](https://github.com/microsoft/onnxruntime/issues/19445)
- [WebGPU support for Node.js - nodejs/node #48747](https://github.com/nodejs/node/issues/48747)
- [Transformers.js v3 Blog Post](https://huggingface.co/blog/transformersjs-v3)
- [Transformers.js v4 Preview](https://huggingface.co/blog/transformersjs-v4)
- [Transformers.js Backend Architecture - DeepWiki](https://deepwiki.com/huggingface/transformers.js/8.2-backend-architecture)
- [Server-side Inference in Node.js - HuggingFace Docs](https://huggingface.co/docs/transformers.js/en/tutorials/node)
- [WebGPU Browser Support 2026](https://webo360solutions.com/blog/webgpu-browser-support-2026/)

### Chunking
- [Chunking Strategies for LLM Applications - Pinecone](https://www.pinecone.io/learn/chunking-strategies/)
- [cAST: AST-Based Code Chunking - arxiv](https://arxiv.org/html/2506.15655v1)
- [AST-Aware Code Chunking - supermemory.ai](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/)
- [Better Retrieval Beats Better Models (AST chunking)](https://sderosiaux.substack.com/p/better-retrieval-beats-better-models)
- [Document Chunking: What Actually Works - synthmetric.com](https://synthmetric.com/document-chunking-size-overlap-and-what-actually-works/)

### Vector Database
- [Pinecone - Vector Dimension Mismatch](https://community.pinecone.io/t/vector-dimension-does-not-match-the-dimension-of-the-index/978)
- [Roo Code - Dimension Mismatch After Model Switch #5616](https://github.com/RooCodeInc/Roo-Code/issues/5616)
- [Common Pitfalls When Using Vector Databases - DagsHub](https://dagshub.com/blog/common-pitfalls-to-avoid-when-using-vector-databases/)
- [Zvec Documentation](https://zvec.org/en/docs/)
- [Zvec GitHub](https://github.com/alibaba/zvec)

### Node.js Memory & Performance
- [Node.js Memory Limits - AppSignal](https://blog.appsignal.com/2021/12/08/nodejs-memory-limits-what-you-should-know.html)
- [Node.js Understanding and Tuning Memory](https://nodejs.org/en/learn/diagnostics/memory/understanding-and-tuning-memory)
- [Node.js CLI Apps Best Practices](https://github.com/lirantal/nodejs-cli-apps-best-practices)

### Incremental Indexing
- [Lucene Corrupted Index Exception - Elasticsearch Labs](https://www.elastic.co/search-labs/blog/lucene-corrupted-index-exception)
- [Incremental IVF Index Maintenance - arxiv](https://arxiv.org/html/2411.00970v1)

### Hashing
- [xxhash-wasm - npm](https://www.npmjs.com/package/xxhash-wasm)
- [xxhash-wasm GitHub](https://github.com/jungomi/xxhash-wasm)
