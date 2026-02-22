# 📄 PRD: Local AI Semantic Search CLI (`ez-search`)

## 1. Product Overview
**Name:** `ez-search`
**Description:** A blazingly fast, 100% local, privacy-first command-line tool that provides semantic search over codebases, documents, and image libraries. 
**Primary Use Case:** To act as a lightning-fast contextual retrieval engine for AI coding assistants (like Claude Code) without requiring cloud vector databases or API keys.

## 2. Technology Stack
*   **Language:** TypeScript (Node.js v22+ required for stable WebGPU)
*   **CLI Framework:** `commander` or `yargs`, with `ora` for terminal spinners.
*   **ML Inference:** `@huggingface/transformers@next`` Must use the **WebGPU** backend for hardware acceleration.
*   **Vector Database:** `@zvec/zvec` (Alibaba's local, in-process C++ vector DB).
*   **File Parsing & Hashing:** `fs/promises`, `ignore` (to respect `.gitignore`), `tree-sitter` (or similar) for code chunking, and `xxhash-wasm` for lightning-fast incremental cache validation.

---

## 3. Model Routing Strategy (The "Brain")
The CLI must dynamically load different ONNX models based on the target file type. The AI agent must implement a model router:

| Target Data | File Extensions | Hugging Face / ONNX Model | Why this model? |
| :--- | :--- | :--- | :--- |
| **Code** | `.ts, .js, .py, .go, .rs, .c, .cpp` | `Xenova/jina-embeddings-v2-base-code` | Specifically trained on GitHub code and docs. Understands programming syntax. |
| **Text/Docs** | `.md, .txt, .pdf, .csv` | `Xenova/nomic-embed-text-v1.5` | Massive context window, top-tier MTEB performance for local natural language. |
| **Images** | `.jpg, .png, .webp` | `Xenova/clip-vit-base-patch32` | Multimodal. Maps image pixels and text queries to the same vector space. |

*Implementation Constraint for AI:* Do **not** load models on startup. Lazy-load the required model *only* after the command is parsed to keep cold-start times under 1.5 seconds.

---

## 4. Core CLI Commands

### Command 1: `ez-search index <directory>`
**Description:** Scans the directory, chunks the data, generates embeddings via WebGPU, and stores them in Zvec.
**Options:**
*   `--type <code|text|image>`: Forces a specific pipeline. If omitted, auto-detect based on file extensions.
*   `--clear`: Deletes the existing `.ez-search/` folder before running to start fresh.

**Execution Flow (AI instructions):**
1.  Read `.gitignore` and `.cursorignore` (if present) to exclude `node_modules`, `venv`, etc.
2.  Traverse directory recursively.
3.  **Chunking:** 
    *   *Code/Text:* Split into ~500 token chunks with 50 token overlap. Keep track of start/end line numbers.
    *   *Images:* Resize/Center-crop using standard CLIP preprocessing.
4.  **WebGPU Batching:** Do NOT send 1,000 chunks to WebGPU at once (will cause VRAM OOM). Process in strict batches of `32`.
5.  **Zvec Storage:** Initialize a Zvec collection saved inside a hidden directory named `<directory>/.ez-search/db/`. 
    *   *Insert payload:* `[embedding_vector]`
    *   *Metadata:* `{ filepath, start_line, end_line, chunk_hash, text_snippet }`

### Command 2: `ez-search query "<search_string>"`
**Description:** Takes a natural language query, embeds it, and returns the top matching files.
**Options:**
*   `--dir <directory>`: Target index directory (defaults to `.`)
*   `--type <code|text|image>`: Which model to use for the query.
*   `--top-k <number>`: Number of results (default: 10).

**Execution Flow (AI instructions):**
1.  Check for the existence of the `<directory>/.ez-search/` folder. Abort if not found.
2.  Lazy-load the appropriate model via `transformers.js` with WebGPU enabled.
3.  Embed the `"<search_string>"`.
4.  Query the local Zvec collection inside `.ez-search/db/` using cosine similarity.
5.  **Output Format:** Print strict, machine-readable output so Claude Code can easily parse it. 
    *   Format: `File: <path> | Lines: <start>-<end> | Relevance: <score>`

---

## 5. Architectural & Code Requirements for the AI

Please build the application using the following strict architectural guidelines:

### A. WebGPU Initialization
When initializing the `pipeline` from `@huggingface/transformers@next`, you must explicitly set the device to WebGPU and define a CPU fallback:
```typescript
const extractor = await pipeline('feature-extraction', 'Xenova/jina-embeddings-v2-base-code', {
    device: 'webgpu',
    dtype: 'fp32', // Use fp32 for Zvec compatibility
});
```

### B. Zvec Database Schema & The `.ez-search/` Directory
All application state, databases, and metadata must be contained entirely within a single hidden `.ez-search/` folder located at the root of the indexed directory.
*   **Database Path:** `<directory>/.ez-search/db/`
*   **Metric:** Cosine Similarity.
*   **Dimensions:** Must dynamically match the model's output (e.g., 768 for Jina/Nomic, 512 for CLIP).
*   **Metadata:** You must store the exact file path and line numbers in Zvec's scalar/metadata fields so the `query` command can point the user (or Claude) to the exact file.

### C. Incremental Indexing & Caching (Maximum Performance)
Do not re-embed files that haven't changed. The CLI must be optimized to scan 10,000+ file codebases in milliseconds.
1.  **The Fast Check (`fs.stat`):** First, check the file's modification time (`mtimeMs`) and file size (`size`). 
2.  **The Integrity Check (xxHash):** If `mtimeMs` changed (e.g., git checkout or touch), but you need to verify if the actual content changed, compute an `xxhash`.
    *   **Do NOT use `crypto.createHash('sha256')` or `md5`.** They are too slow for massive directories.
    *   **Use:** The `xxhash-wasm` npm package.
    *   Initialize the WASM module once, and use `h64ToString(fileBuffer)` to generate a lightning-fast 64-bit non-cryptographic hash.
3.  **The Manifest:** Store these identifiers in a local JSON file at `<directory>/.ez-search/manifest.json`.
    *   *Schema Example:* `{"src/app.ts": { size: 1024, mtime: 170859382, hash: "ef46db3751d8e999" }}`
4.  If the file matches the manifest, **skip file reading and WebGPU inference entirely** for that file.

### D. Project Structure
Organize the TypeScript code as follows:
*   `src/cli.ts` - Commander setup and routing.
*   `src/models/router.ts` - Lazy-loading Transformers.js pipelines.
*   `src/indexer/chunker.ts` - Text/Code splitting logic.
*   `src/indexer/hasher.ts` - `xxhash-wasm` initialization and `fs.stat` logic.
*   `src/db/zvec.ts` - Wrapper around the `@zvec/zvec` SDK for initialization, insertion, and querying (pointing to the `.ez-search` path).
*   `src/commands/index.ts` - The indexing loop and batching logic.
*   `src/commands/query.ts` - The query and output formatting logic.
*   `src/utils/paths.ts` - Helper constants for resolving `.ez-search/db` and `.ez-search/manifest.json`.

---

## 6. Prompt to trigger the AI Agent
*(Copy and paste this along with the PRD into your AI)*

> "You are an expert TypeScript developer and Machine Learning engineer. I want you to build a local CLI tool called `ez-search` based on the attached PRD. Use `commander` for the CLI, `@huggingface/transformers@next` for WebGPU inference, and `@zvec/zvec` for the local vector database. All local tool data must be saved inside a `.ez-search/` hidden folder in the target directory.
> 
> For file caching, you must implement `fs.stat` size/mtime checks falling back to the `xxhash-wasm` package for maximum throughput as outlined in Section 5C.
>
> Please begin by scaffolding the `package.json` with the correct dependencies, the `tsconfig.json`, and the directory structure. Then, implement `src/indexer/hasher.ts`, `src/db/zvec.ts`, and `src/models/router.ts` first, ensuring WebGPU is properly configured with lazy-loading."


