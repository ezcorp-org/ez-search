# ez-search

## What This Is

A local, privacy-first CLI tool that provides semantic search over codebases, documents, and image libraries. It uses ML inference (WebGPU with CPU fallback) to generate embeddings and stores them in a local Zvec vector database, requiring no cloud services or API keys. The primary consumer is AI coding assistants (like Claude Code) that need fast contextual retrieval.

## Core Value

Developers can semantically search their codebase locally with zero cloud dependencies — fast enough to be useful as a retrieval engine for AI assistants.

## Requirements

### Validated

- Index code files into vector embeddings via Jina model — v1.0
- Index text/document files (.md, .txt, .pdf, .csv) via Nomic model — v1.0
- Index image files (.jpg, .png, .webp) via CLIP model — v1.0
- Query indexed embeddings with natural language, ranked results — v1.0
- Auto-detect file type pipeline (code/text/image) by extension — v1.0
- Respect .gitignore and .cursorignore for file exclusion — v1.0
- Incremental indexing via mtime/size + content hash — v1.0
- Lazy-load ML models (cold start 22ms for --help) — v1.0
- Batch inference (batches of 32) — v1.0
- Machine-readable JSON output for AI assistant consumption — v1.0
- Project-scoped storage in `.ez-search/` directory — v1.0

### Active

(None yet — define for next milestone)

### Out of Scope

- Cloud/remote vector databases — defeats the privacy-first purpose
- Real-time file watching / auto-reindex — manual index command is sufficient
- GUI or web interface — CLI-only tool
- Model fine-tuning or training — uses pre-trained ONNX models
- Multi-directory unified search — each directory has its own index
- Bundled LLM/answer generation — primary consumer (AI assistants) already has reasoning

## Context

Shipped v1.0 with 2,294 LOC TypeScript across 85 files.

**Tech stack:** Node.js v22+, TypeScript, Commander CLI, @huggingface/transformers (WebGPU + CPU fallback), @zvec/zvec (in-process C++ vector DB), xxhash-wasm.

**Models:** jinaai/jina-embeddings-v2-base-code (code, 768-dim), nomic-ai/nomic-embed-text-v1.5 (text, 768-dim), openai/clip-vit-base-patch32 (images, 512-dim).

**Architecture:** Three-pipeline model routing (code/text/image) with lazy loading. Project-scoped storage at `<project>/.ez-search/` with shared model cache at `~/.ez-search/models/`. Incremental indexing via manifest cache with chunk-level deduplication.

## Constraints

- **Runtime**: Node.js v22+ required for WebGPU support
- **Language**: TypeScript (ESM)
- **CLI Framework**: commander with ora for spinners
- **ML Inference**: @huggingface/transformers with WebGPU backend, CPU fallback
- **Vector DB**: @zvec/zvec (local, in-process)
- **Hashing**: xxhash-wasm (non-cryptographic, fast)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WebGPU over CPU/WASM | Hardware acceleration for embedding generation speed | CPU fallback confirmed; WebGPU needs vulkan-loader on NixOS |
| Zvec over alternatives | In-process C++ DB, no server, local-only | Confirmed working on NixOS via createRequire() |
| xxhash over SHA256/MD5 | Non-cryptographic hash is faster for cache validation | SHA-256 used for content hash (xxhash for future consideration) |
| Lazy model loading | Keep cold start under 1.5s | 22ms measured for --help |
| Batch size of 32 | Prevent VRAM OOM while leveraging GPU parallelism | Working as designed |
| Project-scoped storage | .ez-search/ in project root, consistent with .git/ | Shipped in Phase 8, replaced ~/.ez-search/<hash>/ |
| CLIP fp32 only | Quantized CLIP fails with onnxruntime-node | Non-negotiable constraint |
| Official model IDs | Xenova mirrors return 401 | Use jinaai/, nomic-ai/ directly |

---
*Last updated: 2026-02-23 after v1.0 milestone*
