# Project Research Summary

**Project:** ez-search
**Domain:** Local AI semantic search CLI tool
**Researched:** 2026-02-22
**Confidence:** MEDIUM-HIGH

## Executive Summary

ez-search is a local, zero-dependency semantic search CLI that uses embedding models to enable natural language search across code, text, and image files. The standard approach for this class of tool is: walk a directory tree, chunk files by type, generate embeddings via ONNX models (optionally GPU-accelerated), store vectors in an embedded database, and retrieve via cosine similarity. The recommended stack -- Transformers.js v4 for inference, Zvec for vector storage, xxhash-wasm for cache validation, and commander for CLI -- is sound but carries two significant unknowns: Zvec's Node.js bindings are less than 3 weeks old, and WebGPU in Node.js is still experimental. Both require validation spikes before committing to a full build.

The recommended approach is to build bottom-up with aggressive abstraction around the two risky dependencies (Zvec and WebGPU). Start with a proof-of-concept spike that validates Zvec works on the target platform (NixOS) and that the WebGPU-to-WASM fallback chain functions correctly. Then build infrastructure (hashing, ignore parsing, path utils), followed by core services (model router, vector DB wrapper, manifest cache), then the indexing pipeline, and finally the query path with formatted output. Code chunking quality is the make-or-break factor for search usefulness -- invest heavily in AST-aware chunking rather than naive token splitting.

The key risks are: (1) Zvec Node.js bindings may be too immature, requiring a swap to LanceDB or hnswlib-node mid-project; (2) WebGPU unavailability on headless/CI/GPU-less systems requires a robust WASM fallback from day one; (3) naive text chunking will destroy search quality for code -- tree-sitter AST chunking is essential; (4) first-run model downloads (130-340MB per model) will appear to hang the CLI without progress feedback. All four are addressable with upfront architecture decisions rather than reactive fixes.

## Key Findings

### Recommended Stack

The stack centers on Transformers.js v4 (`@next` tag required) for model loading and inference, with a WebGPU > WASM > CPU fallback chain. Vector storage uses Zvec (Alibaba's Proxima engine, in-process C++), with LanceDB as the primary fallback if Zvec proves unstable. File change detection uses xxhash-wasm for fast non-cryptographic hashing paired with fs.stat mtime/size checks. The CLI layer is commander + ora, chosen for simplicity over heavier frameworks like oclif.

**Core technologies:**
- **@huggingface/transformers@next (v4):** ML inference -- wraps ONNX Runtime with high-level pipeline API, WebGPU support rewritten in C++ with 4x BERT speedup
- **@zvec/zvec:** Embedded vector DB -- in-process C++ (Proxima), no server process, supports hybrid search and CRUD. Extremely new (Feb 2026), high risk
- **xxhash-wasm:** File hashing -- ~16 GB/s throughput, 1M+ weekly downloads, one-time 2ms WASM init
- **Node.js v22+ LTS:** Runtime -- required for WebGPU Dawn bindings compatibility
- **Three embedding models:** Jina v2 code (768d), Nomic v1.5 text (768d), CLIP ViT-B/32 images (512d) -- separate vector collections per model due to dimension mismatch

### Expected Features

**Must have (table stakes):**
- Natural language query with ranked results (file paths + line numbers)
- Fast indexing with incremental caching (mtime + xxhash manifest)
- .gitignore respect via `ignore` package
- Machine-readable output (JSON, structured text) -- AI agents are the primary consumer
- Multiple file type support (code, text, images via model routing)
- 100% local, offline operation -- zero API keys
- Progress feedback during indexing (ora spinners)

**Should have (differentiators):**
- Multimodal search (code + text + images in one tool) -- the killer feature, no competitor does all three locally
- WebGPU hardware acceleration -- GPU-speed embeddings without Ollama
- MCP server integration -- makes the tool discoverable by Claude Code, Cursor, Windsurf
- Cross-language code search -- free with Jina embeddings, high value for polyglot repos

**Defer (v2+):**
- Hybrid search (BM25 + vector) -- semantic-only is sufficient for v1
- Watch mode / auto-reindex -- manual `ez-search index` is fine initially
- Workspace / multi-directory support -- single directory per index for v1
- Call graph / dependency tracing -- orthogonal to semantic search
- Image-to-image search -- text-to-image covers the primary use case

### Architecture Approach

The architecture follows a layered pattern: CLI commands (thin wrappers) -> pipeline coordinator -> core services (scanner, chunker, model router, vector DB) -> infrastructure (manifest cache, ignore parser, hasher, path utils). All heavy dependencies are lazy-loaded to keep `ez-search --help` under 200ms. The indexing pipeline is streaming (scan -> chunk -> batch embed -> insert per batch) to avoid memory exhaustion on large codebases. Separate vector collections per model type prevent dimension mismatches.

**Major components:**
1. **CLI Layer (commander)** -- parse args, validate input, delegate to pipeline coordinator
2. **File Scanner** -- directory traversal with ignore rules, file type classification by extension
3. **Chunker (3 strategies)** -- AST-aware for code, sliding window for text, CLIP preprocessing for images
4. **Model Router (lazy singleton)** -- loads models on first use, caches for session, maps file type to model
5. **Vector DB Wrapper (Zvec)** -- thin abstraction enabling swap to LanceDB/hnswlib-node if needed
6. **Manifest Cache** -- two-tier change detection (stat then hash), atomic writes, tracks indexed file state

### Critical Pitfalls

1. **WebGPU availability assumption** -- WebGPU is NOT built into Node.js v22; it requires Dawn bindings and a capable GPU. Implement WebGPU > WASM fallback chain from day one. Never let WebGPU failure crash the process.
2. **Zvec Node.js bindings immaturity** -- 3 weeks old, SWIG-generated, zero community usage. Build a thin abstraction layer; test on NixOS immediately. Have LanceDB as concrete fallback.
3. **Naive chunking destroys code search quality** -- Token-count splitting cuts functions in half. Use tree-sitter AST chunking for code files. This is the single biggest factor in whether search results are useful.
4. **First-run model download blocks CLI** -- Models are 130-340MB each. Detect uncached models, show explicit download progress, set cache to `~/.ez-search/models/` not node_modules.
5. **GPU memory leaks during batch processing** -- WebGPU tensors are not GC'd. Explicitly `.dispose()` tensors after extracting embeddings. Use try/finally per batch.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 0: Validation Spike
**Rationale:** Two core dependencies (Zvec and WebGPU) are high-risk unknowns. Validate before building anything on top of them.
**Delivers:** Confirmed working Zvec CRUD on NixOS, confirmed WebGPU->WASM fallback, confirmed Transformers.js v4 pipeline produces embeddings.
**Addresses:** Risk reduction -- if Zvec fails, swap to LanceDB here, not after building the full pipeline.
**Avoids:** Pitfall #3 (Zvec immaturity), Pitfall #1 (WebGPU assumption), Pitfall #15 (NixOS native addon failures).

### Phase 1: Foundation and Infrastructure
**Rationale:** Bottom-up build order. Pure utilities and wrappers with no inter-dependencies. Each module is independently testable.
**Delivers:** Path utils, type definitions, ignore parser, xxhash hasher, project structure, CLI scaffold with lazy loading.
**Addresses:** .gitignore respect, CLI cold-start performance (<200ms for --help).
**Avoids:** Pitfall #10 (cold-start time), Pitfall #14 (xxhash init per file), Pitfall #12 (gitignore complexity).

### Phase 2: Core Services
**Rationale:** Depends on Phase 1 infrastructure. Each service wraps one external dependency behind a clean interface.
**Delivers:** Model router (lazy singleton with WebGPU fallback), Zvec wrapper (create/insert/query/delete/close), manifest cache (stat + hash diffing), file scanner (walk + classify).
**Addresses:** Dimension validation, model cache location, download UX.
**Avoids:** Pitfall #2 (dimension mismatch), Pitfall #4 (model download hang), Pitfall #11 (cache in node_modules).

### Phase 3: Indexing Pipeline
**Rationale:** Depends on all core services. This is the integration phase -- wiring scanner -> manifest -> chunker -> embedder -> store.
**Delivers:** Working `ez-search index <dir>` command with code chunking (single model first, likely Jina for code).
**Addresses:** Table stakes: indexing with caching, incremental re-indexing, ranked results with metadata.
**Avoids:** Pitfall #5 (naive chunking), Pitfall #6 (GPU memory leaks), Pitfall #8 (memory exhaustion), Pitfall #9 (manifest corruption).

### Phase 4: Query and Output
**Rationale:** Cannot query without an index. Simpler than indexing (single embed + vector search + format).
**Delivers:** Working `ez-search query "<text>"` with machine-readable output, --json flag, --top-k control.
**Addresses:** Table stakes: natural language query, ranked results, machine-readable output.
**Avoids:** Pitfall #13 (output not parseable -- stdout for results, stderr for everything else).

### Phase 5: Multi-Model Routing
**Rationale:** With code search working end-to-end, extend to text (Nomic) and images (CLIP). The model router and separate collections architecture already supports this.
**Delivers:** `--type text` and `--type image` flags, automatic type detection by extension, multimodal indexing.
**Addresses:** Differentiator: multimodal search (the killer feature).

### Phase 6: MCP Server and Polish
**Rationale:** MCP integration requires a working query path. This is what makes the tool discoverable by AI agents -- the primary consumer.
**Delivers:** MCP server exposing search as a tool, status command, configurable output formats, error handling polish.
**Addresses:** Differentiator: MCP server integration, configurable output.

### Phase Ordering Rationale

- **Spike first** because Zvec and WebGPU are high-risk unknowns that could force architectural changes. Validating them costs 1-2 days and prevents weeks of rework.
- **Infrastructure before services** because each service wraps infrastructure (hasher, paths, types). Building bottom-up means each layer is testable before the next.
- **Indexing before query** because you cannot query an empty index. Getting one model (code/Jina) working end-to-end proves the full pipeline before adding model complexity.
- **Multi-model after single-model** because the architecture (separate collections, lazy loading) already supports it. Adding models is incremental once the pipeline works.
- **MCP last** because it is an interface layer on top of a working query system. High value but depends on everything below it.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 0 (Spike):** Zvec Node.js API surface is underdocumented. Need hands-on testing to determine actual capabilities and limitations.
- **Phase 3 (Indexing):** AST-aware code chunking with tree-sitter requires language grammar selection and recursive split strategy. Research tree-sitter Node.js bindings and chunking heuristics.
- **Phase 5 (Multi-Model):** CLIP image preprocessing pipeline (resize, crop, normalization) needs Transformers.js-specific research for the image feature-extraction task.
- **Phase 6 (MCP):** MCP server protocol and SDK need research. grepai's MCP implementation is a reference.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Well-documented patterns. xxhash-wasm, ignore, commander all have clear APIs.
- **Phase 2 (Core Services):** Model router is a standard lazy singleton. Manifest is JSON read/write with atomic rename.
- **Phase 4 (Query):** Simple flow: embed query, cosine search, format output. No ambiguity.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Core stack is well-researched. Zvec is the wildcard -- extremely new, zero community validation for Node.js. Transformers.js v4 is preview but from a trusted source. |
| Features | MEDIUM-HIGH | Strong competitive analysis across 9 tools. Table stakes are clear. Differentiators are validated by market gaps. |
| Architecture | HIGH | Layered architecture with lazy loading and streaming pipeline is well-established for this class of tool. Build order is dependency-driven. |
| Pitfalls | HIGH | 15 pitfalls identified with specific prevention strategies. Critical ones are backed by GitHub issues and official docs. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Zvec Node.js API surface:** Official docs focus on Python. The exact Node.js API (collection creation params, query options, error handling) needs hands-on validation. Address in Phase 0 spike.
- **WebGPU on NixOS:** No documented experience running Dawn bindings on NixOS. May need nix-shell with specific native deps. Address in Phase 0 spike.
- **Tree-sitter Node.js bindings:** Multiple options exist (tree-sitter, web-tree-sitter, node-tree-sitter). Which one works best with the target stack needs research in Phase 3 planning.
- **Optimal batch size:** PRD says 32 but no benchmarks exist for consumer GPUs with these specific models. Needs empirical testing during Phase 3.
- **Quantized vs fp32 models:** Using q8 models could cut download size 4x with minimal accuracy loss. Worth testing during Phase 2 but not researched in depth.
- **Nomic embed task prefixes:** Nomic v1.5 requires `search_document:` and `search_query:` prefixes. Must be implemented correctly in the model router or results will be poor.

## Sources

### Primary (HIGH confidence)
- [Transformers.js v4 announcement](https://huggingface.co/blog/transformersjs-v4) -- inference API, WebGPU support, model compatibility
- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/en/guides/webgpu) -- device selection, fallback
- [Zvec documentation](https://zvec.org/en/docs/) -- API surface, collection management
- [WebGPU Memory Leak - transformers.js #860](https://github.com/huggingface/transformers.js/issues/860) -- tensor disposal requirement
- [xxhash-wasm GitHub](https://github.com/jungomi/xxhash-wasm) -- API, performance characteristics
- [Commander.js GitHub](https://github.com/tj/commander.js) -- CLI framework API

### Secondary (MEDIUM confidence)
- [grepai](https://yoanbernabeu.github.io/grepai/), [mgrep](https://github.com/mixedbread-ai/mgrep), [rclip](https://github.com/yurijmikhalevich/rclip) -- competitive feature analysis
- [Pinecone chunking strategies](https://www.pinecone.io/learn/chunking-strategies/) -- chunking best practices
- [AST-aware code chunking - supermemory.ai](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/) -- code chunking patterns
- [obra/episodic-memory](https://deepwiki.com/obra/episodic-memory) -- similar architecture reference

### Tertiary (LOW confidence, needs validation)
- Zvec Node.js SDK actual API and stability -- zero community usage reports exist
- Transformers.js v4 Node.js WebGPU performance in CLI context -- blog claims only, no independent benchmarks
- Optimal batch size for consumer GPUs with Jina/Nomic/CLIP models -- needs empirical testing

---
*Research completed: 2026-02-22*
*Ready for roadmap: yes*
