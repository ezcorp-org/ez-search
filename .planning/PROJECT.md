# ez-search

## What This Is

A local, privacy-first CLI tool that provides semantic search over codebases, documents, and image libraries. It uses WebGPU-accelerated ML inference to generate embeddings and stores them in a local vector database, requiring no cloud services or API keys. The primary consumer is AI coding assistants (like Claude Code) that need fast contextual retrieval.

## Core Value

Developers can semantically search their codebase locally with zero cloud dependencies — fast enough to be useful as a retrieval engine for AI assistants.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Index a directory of code files into local vector embeddings via WebGPU
- [ ] Index text/document files (.md, .txt, .pdf, .csv) with a text-optimized model
- [ ] Index image files (.jpg, .png, .webp) with a multimodal CLIP model
- [ ] Query indexed embeddings with natural language and return ranked results
- [ ] Auto-detect file type pipeline (code/text/image) based on extensions
- [ ] Respect .gitignore and .cursorignore for file exclusion
- [ ] Incremental indexing — skip unchanged files using mtime/size + xxhash
- [ ] Lazy-load ML models (cold start under 1.5s)
- [ ] Batch WebGPU inference (batches of 32) to avoid VRAM OOM
- [ ] Machine-readable output format for AI assistant consumption
- [ ] All state stored in `.ez-search/` hidden directory at index root

### Out of Scope

- Cloud/remote vector databases — defeats the privacy-first purpose
- Real-time file watching / auto-reindex — manual index command is sufficient for v1
- GUI or web interface — CLI-only tool
- Model fine-tuning or training — uses pre-trained ONNX models
- Multi-directory unified search — each directory has its own index

## Context

- Primary workflow: developer runs `ez-search index .` on their project, then `ez-search query "how does auth work"` to find relevant code
- AI assistants can call `ez-search query` programmatically and parse the structured output
- Three model routing paths: Jina (code), Nomic (text), CLIP (images) — each lazy-loaded per command
- WebGPU in Node.js v22+ is experimental — may need to pivot to CPU/WASM if stability issues arise
- Zvec (@zvec/zvec) is an in-process C++ vector DB — no server process needed

## Constraints

- **Runtime**: Node.js v22+ required for WebGPU support
- **Language**: TypeScript
- **CLI Framework**: commander with ora for spinners
- **ML Inference**: @huggingface/transformers@next with WebGPU backend
- **Vector DB**: @zvec/zvec (local, in-process)
- **Hashing**: xxhash-wasm (not crypto hashes — speed is critical for 10k+ file codebases)
- **Models**: Xenova/jina-embeddings-v2-base-code (code), Xenova/nomic-embed-text-v1.5 (text), Xenova/clip-vit-base-patch32 (images)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WebGPU over CPU/WASM | Hardware acceleration for embedding generation speed | — Pending |
| Zvec over alternatives | In-process C++ DB, no server, local-only | — Pending |
| xxhash over SHA256/MD5 | Non-cryptographic hash is orders of magnitude faster for cache validation | — Pending |
| Lazy model loading | Keep cold start under 1.5s — don't load models until command is parsed | — Pending |
| Batch size of 32 | Prevent VRAM OOM while still leveraging GPU parallelism | — Pending |

---
*Last updated: 2026-02-22 after initialization*
