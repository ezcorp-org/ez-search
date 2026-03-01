# ez-search

Semantic codebase search with zero cloud dependencies.

`ez-search` is a local, privacy-first CLI tool that provides semantic search over codebases, documents, and image libraries. It uses ML inference (WebGPU with CPU fallback) to generate embeddings and stores them in a local vector database. No cloud services, no API keys, no data leaves your machine.

Built as a contextual retrieval engine for AI coding assistants like Claude Code.

## Features

- **Three search pipelines** -- code, text/documents, and images (code and text share a single model with task-specific query prefixes; images use CLIP)
- **Hybrid search** -- combines semantic vector search with BM25 keyword matching (via code-aware tokenization) for best-of-both-worlds retrieval; also supports pure semantic or keyword-only modes
- **Incremental indexing** -- only re-embeds files that have changed (mtime + content hash)
- **WebGPU acceleration** with automatic CPU fallback
- **Respects .gitignore and .cursorignore** -- skips `node_modules`, `dist`, lockfiles, etc. by default
- **Machine-readable JSON output** -- designed for AI assistant consumption
- **Project-scoped storage** -- all index data lives in `.ez-search/` within your project

## Requirements

- **Node.js v20+** (v22+ recommended for WebGPU support)
- Models are downloaded automatically on first run (~900MB total for both models)

## Installation

```bash
npm install -g @ez-corp/ez-search
# or
yarn global add @ez-corp/ez-search
# or
pnpm add -g @ez-corp/ez-search
# or
bun add -g @ez-corp/ez-search
```

Or from source:

```bash
git clone https://github.com/ezcorp-org/ez-search.git
cd ez-search
npm install
npm run build
```

## Quick Start

```bash
# Just search — auto-indexes on first run, no setup needed
ez-search query "error handling in the auth module"
```

Or if you prefer to index explicitly first:

```bash
# Index the current directory
ez-search index .

# Then search
ez-search query "error handling in the auth module"

# Check index status
ez-search status
```

## CLI Reference

### `ez-search index <path>`

Scan a directory, chunk files, generate embeddings, and store them in the local vector database.

```bash
ez-search index .
ez-search index ./src --type code
ez-search index . --clear --format text
```

| Flag | Description |
|------|-------------|
| `--type <code\|text\|image>` | Index only files of a specific type. If omitted, all types are auto-detected by file extension. |
| `--clear` | Delete the existing `.ez-search/` index before indexing. |
| `--no-ignore` | Disable `.gitignore` and `.cursorignore` filtering. |
| `-q, --quiet` | Suppress status output. |
| `--format <json\|text>` | Output format. Default: `json`. |
| `--model <path>` | Custom text/code embedding model (HuggingFace ID or local ONNX path). |
| `--clip-model <path>` | Custom CLIP image model (HuggingFace ID or local ONNX path). |

### `ez-search query <text>`

Search the index with a natural language query. Run from inside an indexed directory.

```bash
ez-search query "database connection pooling"
ez-search query "how are users authenticated" --format text
ez-search query "parse config" -k 5 --dir src/config
ez-search query "validation logic" --threshold 0.7
ez-search query "handleUserAuth" --mode keyword    # exact identifier search
ez-search query "auth logic" --mode semantic       # pure vector search
```

| Flag | Description |
|------|-------------|
| `-k, --top-k <n>` | Number of results to return. Default: `10`. |
| `--type <code\|text\|image>` | Search a specific pipeline only. |
| `--dir <path>` | Scope results to a subdirectory. |
| `--threshold <score>` | Minimum relevance score (0-1) to include in results. |
| `--mode <hybrid\|semantic\|keyword>` | Search mode. `hybrid` (default) fuses vector + BM25 results. `semantic` uses vector search only. `keyword` uses BM25 keyword matching only. |
| `--no-auto-index` | Disable automatic indexing when no index exists. |
| `--format <json\|text>` | Output format. Default: `json`. |
| `--model <path>` | Custom text/code embedding model (HuggingFace ID or local ONNX path). |
| `--clip-model <path>` | Custom CLIP image model (HuggingFace ID or local ONNX path). |

JSON output returns a grouped envelope:

```json
{
  "query": "database connection",
  "totalIndexed": 142,
  "searchScope": ".",
  "mode": "hybrid",
  "code": [
    {
      "file": "src/db/pool.ts",
      "lines": { "start": 12, "end": 45 },
      "score": 0.87,
      "text": "..."
    }
  ],
  "text": [
    {
      "file": "docs/architecture.md",
      "score": 0.72,
      "text": "..."
    }
  ],
  "image": [
    {
      "file": "docs/diagram.png",
      "score": 0.65
    }
  ]
}
```

Text output uses a human-readable format:

```
## Code

File: src/db/pool.ts | Lines: 12-45 | Relevance: 0.87
    <chunk text>

## Text

File: docs/architecture.md | Relevance: 0.72
    <chunk text>

## Images

File: docs/diagram.png | Relevance: 0.65
```

### `ez-search status`

Show indexing status for the current directory.

```bash
ez-search status
ez-search status --format text
```

| Flag | Description |
|------|-------------|
| `--format <json\|text>` | Output format. Default: `json`. |
| `--no-ignore` | Disable `.gitignore` and `.cursorignore` filtering when computing stale file count. |

Reports file count, chunk count, per-type breakdown, index size, last indexed time, and number of stale (unindexed) files.

## Supported File Types

| Type | Extensions |
|------|------------|
| Code | `.ts` `.tsx` `.js` `.jsx` `.py` `.go` `.rs` `.java` `.c` `.cpp` `.h` `.hpp` `.rb` `.php` `.swift` `.kt` `.scala` `.sh` `.bash` `.zsh` `.css` `.scss` `.html` `.json` `.yaml` `.yml` `.toml` |
| Text | `.md` `.mdx` `.txt` `.rst` `.csv` `.pdf` |
| Image | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.svg` |

## How It Works

ez-search uses three specialized embedding models, each optimized for a different data type:

| Pipeline | Model | Dimensions | Chunking |
|----------|-------|------------|----------|
| Code | `onnx-community/Qwen3-Embedding-0.6B-ONNX` | 768 (truncated from 1024 via Matryoshka) | 500-token sliding window, 50-token overlap |
| Text | `onnx-community/Qwen3-Embedding-0.6B-ONNX` | 768 (truncated from 1024 via Matryoshka) | Paragraph-boundary splitting, ~1600 chars per chunk |
| Image | `Xenova/clip-vit-base-patch16` | 512 | One vector per image (no chunking) |

Models are lazy-loaded -- only the model needed for the current operation is loaded. Code and text share a single Qwen3 model (differentiated by instruct prefix at query time), so loading one implicitly covers both. On first run, model weights are downloaded and cached in `~/.ez-search/models/`.

**Incremental indexing:** A manifest at `.ez-search/manifest.json` tracks file size, mtime, and content hash (SHA-256). On subsequent runs, only changed files are re-embedded. Chunk-level deduplication further reduces work when only part of a file changes.

**Vector storage:** Embeddings are stored in Zvec (`@zvec/zvec`), an in-process C++ vector database. Code and text share a 768-dimension collection; images use a separate 512-dimension collection. Both use cosine similarity for search.

**Lexical index:** A BM25 keyword index (powered by MiniSearch) is built alongside the vector index at `.ez-search/lexical-index.json`. It uses a code-aware tokenizer that splits `camelCase`, `snake_case`, `kebab-case`, and `dot.notation` identifiers into sub-tokens. In hybrid mode (the default), results from both vector and keyword search are fused using Reciprocal Rank Fusion (RRF).

## Configuration

ez-search uses convention over configuration. There are no config files.

- **Project index:** stored in `<project>/.ez-search/` (add to `.gitignore`)
- **Model cache:** stored in `~/.ez-search/models/` (shared across projects)
- **File filtering:** respects `.gitignore` and `.cursorignore` by default; disable with `--no-ignore`
- **Built-in exclusions:** `node_modules`, `.git`, `dist`, `build`, lockfiles, `.min.js`, `.min.css`, `.map`, and other common noise are always excluded
- **Custom models:** Use `--model` and `--clip-model` to swap in your own ONNX models (HuggingFace ID or local path). The library API equivalents are `model` and `clipModel` in `IndexOptions`/`QueryOptions`.

## Troubleshooting

**WebGPU not available / falling back to CPU**

WebGPU requires Node.js v22+ and a Vulkan-capable GPU. On systems without GPU support (or on NixOS where `vulkan-loader` may not be in the default environment), ez-search falls back to CPU with q8 quantization automatically. CPU mode is slower but functionally identical.

On NixOS, you can enable Vulkan with:
```bash
nix-shell -p vulkan-loader
```

**Model download is slow or fails**

Models are downloaded from Hugging Face on first use. If downloads fail, check your internet connection. Models are cached in `~/.ez-search/models/` -- you can delete this directory to force re-download.

**"No index found" error**

Querying auto-indexes on first run. If you used `--no-auto-index`, run `ez-search index .` in your project directory first.

**"No supported files found" error**

The target directory contains no files with recognized extensions. Check the supported file types table above.

**Large index size**

Use `ez-search index --clear .` to rebuild the index from scratch. This removes stale entries from deleted files.

## License

[ISC](LICENSE)
