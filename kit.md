---
schema: "kit/1.0"
slug: "ez-search"
title: "ez-search: Local Semantic Search"
summary: "Privacy-first semantic search for code, docs, and images with local ML embeddings and hybrid retrieval."
version: "1.3.7"
license: "ISC"

model:
  provider: "Anthropic"
  name: "claude-sonnet-4-6"
  version: "claude-sonnet-4-6-20250514"
  hosting: "cloud API — any Claude model works as the orchestrating agent; ez-search runs its own local ML models"

tags:
  - "semantic-search"
  - "code-search"
  - "image-search"
  - "document-search"
  - "embeddings"
  - "local"
  - "privacy"
  - "cli"
  - "rag"
  - "vector-search"

tech:
  - "node"
  - "typescript"
  - "onnxruntime"
  - "transformers.js"
  - "webgpu"

skills:
  - "ez-search"

tools:
  - "terminal"

services: []

selfContained: false

prerequisites:
  - name: "Node.js v20+"
    check: "node -v"
  - name: "npm"
    check: "npm -v"

inputs:
  - name: "directory"
    description: "The project root (or subdirectory) containing code, documents, or images to index and search"
  - name: "search-query"
    description: "Natural language description of the code, document, image, or concept to find"

outputs:
  - name: "search-results"
    description: "Ranked JSON with file paths, line ranges, relevance scores, and text snippets"
  - name: "index-status"
    description: "JSON health report with file count, staleness, and storage size"

useCases:
  - name: "Codebase exploration"
    description: "Find implementations by describing behavior — 'where is auth handled', 'database connection pool setup'"
    scenario: "Agent needs to locate authentication logic in a large Node.js project without knowing file names or function signatures"
  - name: "Documentation discovery"
    description: "Search prose and markdown files semantically to find relevant docs without knowing filenames"
    scenario: "Agent needs to find relevant architecture docs to answer a user question about how the system handles failures"
  - name: "Image search"
    description: "Find diagrams, screenshots, and visual assets by describing their content"
    scenario: "Agent needs to locate an architecture diagram or UI screenshot referenced in a conversation"
  - name: "Large project navigation"
    description: "Navigate codebases too large to fit in context by retrieving only the most relevant chunks"
    scenario: "Agent working in a monorepo with thousands of files needs to find the 5 most relevant files for a task"

failures:
  - problem: "First run takes 30-60+ seconds due to ~900MB model download from Hugging Face"
    resolution: "Run `ez-search index .` explicitly once to trigger model download and initial indexing before query workflows"
    scope: "general"
  - problem: "NO_INDEX error when querying with --no-auto-index flag"
    resolution: "Run `ez-search index .` to create the index before querying"
    scope: "general"
  - problem: "WebGPU not available — falls back to CPU with slower inference"
    resolution: "Use Node.js v22+ with a Vulkan-capable GPU. On NixOS add vulkan-loader via nix-shell"
    scope: "environment"
  - problem: "Model download fails or hangs mid-download"
    resolution: "Check internet connection then remove ~/.ez-search/models/ to force a clean re-download"
    scope: "general"

environment:
  runtime: "Node.js v20+ (v22+ recommended for WebGPU acceleration)"
  os:
    - "linux"
    - "macos"
    - "windows"
  adaptationNotes: "All processing is local. No network access required after initial model download. Models cached in ~/.ez-search/models/ (~900MB shared across all projects)."

verification:
  command: "ez-search status --format json"
  expected: "JSON object with indexed file count and index health status"

fileManifest:
  - path: "cli/commands/index-cmd.ts"
    description: "Index command — scan, chunk, embed, and store pipeline with incremental manifest-based caching"
    role: "src"
  - path: "cli/commands/query-cmd.ts"
    description: "Query command — multi-collection search with hybrid (semantic + BM25), semantic, or keyword modes"
    role: "src"
  - path: "cli/commands/status-cmd.ts"
    description: "Status command — reports index health, file counts, staleness, and storage size"
    role: "src"
  - path: "cli/errors.ts"
    description: "CLI error formatting — converts EzSearchError to structured JSON or text output with exit codes"
    role: "src"
  - path: "cli/index.ts"
    description: "CLI entry point — commander-based program definition with index, query, and status subcommands"
    role: "src"
  - path: "cli/progress.ts"
    description: "Live progress reporter — single-line TTY progress bar for CLI indexing operations"
    role: "src"
  - path: "config/paths.ts"
    description: "Path resolvers for project storage (.ez-search/) and shared model cache (~/.ez-search/models/)"
    role: "src"
  - path: "errors.ts"
    description: "EzSearchError class and ErrorCode type — structured errors with codes and suggestions"
    role: "src"
  - path: "index.ts"
    description: "Library entry point — exports index(), query(), status() functions for programmatic use"
    role: "src"
  - path: "services/chunker.ts"
    description: "Code chunker — splits source files into 500-token windows with 50-token overlap and line tracking"
    role: "src"
  - path: "services/download-progress.ts"
    description: "Model download progress callback — TTY-aware status display for Transformers.js model fetches"
    role: "src"
  - path: "services/file-scanner.ts"
    description: "File scanner — async generator that walks directories respecting .gitignore and .cursorignore"
    role: "src"
  - path: "services/hybrid-fusion.ts"
    description: "Reciprocal Rank Fusion (RRF) — merges semantic and lexical result lists into a single ranked output"
    role: "src"
  - path: "services/image-embedder.ts"
    description: "CLIP image embedding service — converts images to 512-dim vectors and encodes text queries for image search"
    role: "src"
  - path: "services/lexical-index.ts"
    description: "BM25 lexical index — MiniSearch wrapper with code-aware tokenization (camelCase, snake_case splitting)"
    role: "src"
  - path: "services/manifest-cache.ts"
    description: "Manifest cache — tracks indexed files with mtime+SHA-256 change detection for incremental indexing"
    role: "src"
  - path: "services/model-router.ts"
    description: "Model router — Transformers.js pipeline creation with WebGPU-to-CPU fallback and Matryoshka dim truncation"
    role: "src"
  - path: "services/query-utils.ts"
    description: "Query utilities — normalizes vector DB results and collapses adjacent chunks into merged ranges"
    role: "src"
  - path: "services/staleness.ts"
    description: "Staleness calculator — counts new, modified, and deleted files relative to the manifest"
    role: "src"
  - path: "services/text-chunker.ts"
    description: "Text chunker — splits documents on paragraph boundaries with sentence-aware fallback for oversized blocks"
    role: "src"
  - path: "services/vector-db.ts"
    description: "Vector DB service — wraps @zvec/zvec with two collections: col-768 (code+text) and col-512 (images)"
    role: "src"
  - path: "types.ts"
    description: "Shared types — FileType, SearchMode, ScannedFile, ScanOptions, ModelBackend, and EXTENSION_MAP"
    role: "src"

parameters:
  - name: "threshold"
    value: "0.5"
    description: "Recommended minimum relevance score for filtering noise"
  - name: "top-k"
    value: "10"
    description: "Default number of results per query"
  - name: "mode"
    value: "hybrid"
    description: "Default search mode — fuses vector similarity and BM25 keyword matching"
---

## Goal

Enable AI coding agents to install and use **[ez-search](https://ez-search.ezcorp.org/)** — a local, privacy-first semantic search engine for codebases, documents, and images. ez-search runs entirely on-device using ML embeddings (WebGPU with CPU fallback) and a local vector database. No API keys, no cloud services, no data leaves your machine.

Agents gain the ability to find code, documentation, and images **by meaning** rather than exact text match, using hybrid retrieval that combines semantic vector search with BM25 keyword matching across three specialized pipelines.

## When to Use

**Use ez-search when:**

- You need to find code by meaning — "where is authentication handled", "find the database connection pool"
- You need to search documentation or prose files semantically
- You need to find images by description — "find the architecture diagram", "screenshots of the login page"
- Privacy requirements prohibit sending code or assets to cloud search services
- You need to discover code patterns, architecture, or related implementations across a large project
- The project is too large to fit in context and you need targeted retrieval

**Do NOT use when:**

- Exact string matching suffices — use `grep` or `rg` instead
- Searching for a known filename — use `find` or `glob`
- Looking up a specific symbol — use the language server / LSP
- The project is small enough to read entirely into context

## Setup

### Install

```bash
npm install -g @ez-corp/ez-search
```

Alternative package managers:
```bash
yarn global add @ez-corp/ez-search
pnpm add -g @ez-corp/ez-search
bun add -g @ez-corp/ez-search
```

### Models

On first use, ez-search downloads two ML models from Hugging Face (~900MB total):

| Model | Pipeline | Size |
|-------|----------|------|
| Qwen3-Embedding-0.6B-ONNX | Code + Text | ~800MB |
| CLIP ViT Base Patch16 | Images | ~100MB |

Models are cached at `~/.ez-search/models/` and shared across all projects. This is a one-time cost. Models are lazy-loaded — only the model needed for the current operation is downloaded.

### Services

ez-search requires no external services or API keys. All processing runs locally on-device.

### Parameters

Default parameters are configured for general use:

- **threshold**: `0.5` — minimum relevance score for filtering noise
- **top-k**: `10` — default number of results per query
- **mode**: `hybrid` — fuses vector similarity and BM25 keyword matching

All parameters can be overridden per-query via CLI flags.

### Environment

- **Node.js v20+** required. v22+ recommended for WebGPU GPU acceleration.
- No configuration files needed. ez-search uses convention over configuration.
- Project index stored in `.ez-search/` at the project root — add this to `.gitignore`.
- Respects `.gitignore` and `.cursorignore` by default.

### Verify Installation

```bash
ez-search status --format json
```

If the command is found and returns JSON (even an error about no index), installation is successful.

## Steps

### 1. Check Index Status

```bash
ez-search status --format json
```

Determine whether an index exists and whether it is stale (files have changed since last indexing). If no index exists, proceed to step 2.

### 2. Index the Directory

```bash
ez-search index . --format json
```

This scans the directory for code, documents, and images, chunks files, generates embeddings, and stores them in the local vector database. Auto-indexing happens on first query too, but explicit indexing avoids query-time latency and lets you verify the file count.

Options:
- `--type code|text|image` — index only a specific file type
- `--clear` — wipe and rebuild the index from scratch
- `--quiet` — suppress progress output

### 3. Search with Natural Language

```bash
ez-search query "your question here" --format json --threshold 0.5
```

**Always use `--format json`** for structured, machine-readable output.

Three search modes:
- `--mode hybrid` (default) — fuses vector + BM25 results; best for most queries
- `--mode semantic` — pure vector search; best for conceptual queries where keywords might mislead
- `--mode keyword` — BM25 only; best for searching specific identifiers like `handleUserAuth`

### 4. Interpret Results

The JSON response contains grouped arrays:

```json
{
  "query": "authentication middleware",
  "totalIndexed": 150,
  "searchScope": ".",
  "mode": "hybrid",
  "code": [
    {
      "file": "src/auth.ts",
      "lines": { "start": 10, "end": 25 },
      "score": 0.92,
      "text": "function authenticate(token: string) { ... }"
    }
  ],
  "text": [
    {
      "file": "docs/auth.md",
      "score": 0.85,
      "text": "Authentication is handled via..."
    }
  ],
  "image": [
    {
      "file": "docs/auth-flow.png",
      "score": 0.65
    }
  ]
}
```

Score interpretation:
- **0.7+** — strong match, read this file
- **0.5–0.7** — relevant, worth scanning
- **Below 0.5** — likely noise

### 5. Refine and Iterate

- `--type code` to focus on implementations (skips docs, images, and READMEs)
- `--type text` to focus on documentation and prose
- `--type image` to search images by description (JPG, PNG, GIF, WebP, SVG)
- `--dir src/` to scope results to a subdirectory
- `--top-k 5` to limit result count
- `--threshold 0.7` to raise the relevance bar

### 6. Maintain the Index

The index is incremental — only changed files are re-embedded on subsequent runs. Check staleness with `ez-search status --format json` and look for the `stale` and `staleFileCount` fields. Rebuild from scratch when needed:

```bash
ez-search index . --clear --format json
```

## Examples

See [examples/claude-code-workflow.md](examples/claude-code-workflow.md) for a complete walkthrough of an agent using ez-search to find authentication code across a large Node.js project. The example demonstrates the full index → search → read → synthesize pattern.

For score interpretation and search mode selection guidance, see [assets/score-interpretation.md](assets/score-interpretation.md).

## Constraints

- **Node.js v20+** required. v22+ recommended for WebGPU acceleration.
- First model download requires internet access (~900MB). After that, fully offline.
- CPU fallback is functional but slower than WebGPU for embedding generation.
- Supported file types are fixed: 27+ code extensions, 6 text extensions, 6 image extensions. See the skill file for the full list.
- Index stored at `.ez-search/` in the project root — add to `.gitignore`.
- Model cache at `~/.ez-search/models/` is shared across all projects.
- Tested against `@ez-corp/ez-search` v1.3.x.

## Safety Notes

- **All data stays local.** No code, embeddings, or queries are sent to any remote service. The only network call is the initial model download from Hugging Face.
- **The `.ez-search/` directory contains vector embeddings of your code, documents, and images.** These are numerical representations that encode semantic meaning. Treat this directory with the same confidentiality as the source files themselves. Never commit it to version control.
- **Using `--no-ignore` may index sensitive files** normally excluded by `.gitignore` (e.g., `.env`, credentials, secrets). Avoid this flag in repositories containing secrets unless you specifically need to search those files.
- **Model supply chain:** Weights are downloaded from Hugging Face over HTTPS on first run. To verify integrity, compare SHA-256 checksums of files in `~/.ez-search/models/` against the `onnx/` tree on each model's Hugging Face page (`onnx-community/Qwen3-Embedding-0.6B` and `Xenova/clip-vit-base-patch16`). In air-gapped or high-security environments, pre-stage verified models into `~/.ez-search/models/` to eliminate the runtime download entirely.
- **Index persists across branch switches.** Embeddings from a previous branch remain searchable until re-indexed. If a branch contained secrets or sensitive code, run `ez-search index . --clear` after switching to avoid leaking stale content into search results.
- **`--clear` is destructive and irreversible.** It deletes the entire `.ez-search/` index directory. There is no undo — the index must be fully rebuilt, which re-downloads and re-embeds all files.
- **Large repositories consume significant disk space.** The index (`.ez-search/`) can grow to hundreds of megabytes for large codebases, in addition to the ~900MB shared model cache. Monitor disk usage in constrained environments like CI runners or containers.
- **Search queries and results are held in process memory.** In shared or multi-tenant environments (CI, remote dev servers), other processes with memory inspection capabilities could observe query text and result snippets. Run ez-search in isolated process contexts when searching sensitive codebases.
- **No code execution.** ez-search never evaluates, imports, or executes the files it indexes. Files are read as plain text, chunked, and embedded. Malicious code in indexed files cannot achieve code execution through the indexing or search pipeline.

## Inputs

**Directory:** The project root or any subdirectory. Works with projects containing source code, documentation, images, or any combination. Monorepo subdirectories work — just pass the path to `--dir` or run from within the subdirectory.

**Search query:** A natural language description of what you're looking for. Describe the behavior, concept, or visual content — not the exact code. Good: "where are database connections configured", "architecture diagram", "screenshots of the dashboard". Bad: "const db = new Pool".

## Outputs

**Query results:** A JSON envelope with `code`, `text`, and `image` arrays. Each result includes:
- `file` — relative path to the matching file
- `lines` — `{ start, end }` line range (code results only)
- `score` — relevance score from 0 to 1
- `text` — the matching chunk content (code and text results)

**Index status:** A JSON object with `totalFiles`, `totalChunks`, per-type breakdowns, `indexSize`, `lastIndexed` timestamp, and `stale`/`staleFileCount` fields.

## Failures Overcome

**First-run latency:** The initial model download (~900MB) causes a 30-60+ second delay. Mitigate by running `ez-search index .` explicitly before entering a query workflow, so models are cached for subsequent calls.

**WebGPU unavailability:** On systems without GPU support or Vulkan drivers, ez-search falls back to CPU with q8 quantization automatically. Functionally identical, just slower. On NixOS, enable Vulkan with `nix-shell -p vulkan-loader`. Node.js v22+ is required for WebGPU.

**Model download failures:** If downloads hang or fail, check internet connectivity. Delete `~/.ez-search/models/` to force a clean re-download. Models are fetched from Hugging Face over HTTPS.

**Stale index:** After major file changes (branch switches, large refactors), the index may be stale. Run `ez-search status --format json` to check, then `ez-search index . --format json` to incrementally update. Use `--clear` to rebuild from scratch if needed.

## Learn More

Visit [ezcorp.org](https://ez-search.ezcorp.org/) for documentation, updates, and other ez-corp tools.

## Validation

After installation, verify the setup with these steps:

1. **Command available:** `ez-search status --format json` returns valid JSON (even an error about no index is fine)
2. **Indexing works:** `ez-search index . --format json` in any project directory completes and reports files indexed
3. **Search works:** `ez-search query "test" --format json` returns results with scores
4. **Index created:** `.ez-search/` directory exists in the project root after indexing
