# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Developers can semantically search their codebase locally with zero cloud dependencies -- fast enough to be useful as a retrieval engine for AI assistants.
**Current focus:** Phase 6: Status and Polish (COMPLETE — verified)

## Current Position

Phase: 6 of 6 (Status and Polish)
Plan: 1 of 1 in current phase
Status: Phase complete — all plans executed, verified, gap closed
Last activity: 2026-02-23 -- Phase 6 verified, gap fixed (EMPTY_DIR error wiring)

Progress: [██████████] 100% (12/12 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 14 min
- Total execution time: ~1.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-validation-spike | 2/2 | 62 min | 31 min |
| 02-foundation-and-infrastructure | 3/3 | 29 min | ~10 min |
| 03-code-indexing-pipeline | 3/3 | ~16 min | ~5 min |
| 04-search-and-query | 1/1 | ~7 min | 7 min |
| 05-multi-model-routing | 3/3 | ~21 min | 7 min |

**Recent Trend:**
- Last 5 plans: 25 min, <1 min, 8 min, 7 min, 5 min
- Trend: fast (service/pipeline wiring tasks)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **Zvec viability CONFIRMED** -- @zvec/zvec v0.2.0 passes all CRUD operations at 768-dim/1000-docs on NixOS. Proceed with Zvec as vector DB in Phase 2+.
- **ID format constraint** -- Zvec rejects IDs containing colons. Use underscores/hyphens only (e.g., `doc_123`, `chunk_abc-456`).
- **COSINE distance semantics** -- Zvec COSINE metric returns distance (0=exact match), not similarity. Sort ascending for ranking.
- **optimizeSync is required** -- Call after bulk inserts for 10x query speedup (4ms -> 0.4ms observed).
- **ESM/CJS interop** -- Use `createRequire(import.meta.url)` to import @zvec/zvec in ESM projects.
- **Transformers.js CPU fallback confirmed** -- WebGPU fails on NixOS without vulkan-loader; CPU q8 fallback works automatically, <100ms inference.
- **WebGPU NixOS requirement** -- Requires vulkan-loader in LD_LIBRARY_PATH (pkgs.vulkan-loader in shell.nix).
- **Model selection confirmed** -- jinaai/jina-embeddings-v2-base-code (code, 768-dim) and nomic-ai/nomic-embed-text-v1.5 (text, 768-dim, task prefixes required).
- **device: 'cpu' not 'wasm'** -- For Node.js Transformers.js fallback; 'wasm' is browser-only.
- **Official model IDs only** -- Xenova/ mirrors return 401; use jinaai/ and nomic-ai/ directly.
- **Dynamic import() for lazy loading** -- All CLI command handlers use `await import('./commands/xxx.js')` to defer heavy module loading. Compiled --help runs in 22ms.
- **crypto.createHash not crypto.hash** -- Use `crypto.createHash('sha256')` (Node 20+) not `crypto.hash()` (Node 21.7+ only) for compatibility with engines>=20.
- **tsconfig rootDir = src** -- Changed from `.` to `src` to prevent spike/ files from appearing in dist/ output.
- **Commander --no-ignore convention** -- `--no-ignore` flag yields `options.ignore = false` (boolean); true = use ignore files, false = disabled. Wiring to scanFiles deferred to Phase 3.
- **Scanner gitignore dir semantics** -- Check both `relPath+'/'` and `relPath` for directories; both patterns (`dist` and `dist/`) must be respected.
- **Scanner always excludes built-ins** -- Built-in exclusions active even when `useIgnoreFiles: false`; only `.gitignore`/`.cursorignore` are disabled.
- **Scanner skips symlinks** -- No explicit cycle detection needed; symlinks are skipped entirely.
- **VectorCollection close() is a no-op** -- Zvec handles GC-cleaned; use destroySync() only to delete from disk.
- **embed() uses Promise.all** -- Batch parallelism on CPU via Promise.all; ONNX handles internal concurrency.
- **tsx CJS conflict in /tmp** -- Files in /tmp without package.json treated as CJS by tsx, rejecting top-level await. Use async main() wrapper or .mts extension.
- **Tokenizer singleton pattern** -- Load AutoTokenizer once via loadTokenizer(), pass to all chunkFile() calls. Loading per-file costs ~1s each.
- **encode() returns array-like not plain Array** -- Jina tokenizer encode() has .length but Array.isArray() returns false. Use Array.from() for slice(), or cast `(ids as unknown as { length: number }).length` for counting.
- **Manifest version mismatch → empty manifest** -- No migration; simpler to re-index than handle partial compatibility.
- **makeChunkId format** -- `<12-char sha256-path-hash>_<4-digit-index>`, no colons (Zvec constraint).
- **Vector DB schema v2** -- chunkText STRING field added; ensureSchemaVersion() auto-wipes col-768/col-512 on mismatch.
- **All three type pipelines active** -- Index command now routes code/text/image automatically when --type omitted; early-exit stubs removed.
- **Mixed col-768 query strategy** -- Over-fetch topK*5 from col-768, then filter by modelId (jina for code, nomic for text); fetchCount = topK*5*(hasPostFilters?3:1).
- **Grouped query output** -- JSON envelope { code: [...], text: [...] } with optional keys; text output uses ## Code / ## Text headers.
- **Optimize-then-save ordering** -- col768.optimize() always called before saveManifest(). Manifest is the integrity marker; only written after optimize succeeds.
- **--clear wipes entire storagePath** -- rmSync(storagePath, recursive) removes col-768, col-512, and schema-version.json atomically; openProjectCollections() recreates everything fresh.
- **Chunk-level diff by index position** -- existingChunks[chunk.chunkIndex] compared by textHash; unchanged chunks skip re-embedding and count as reused.
- **Score normalization** -- COSINE distance converts to score via `1 - distance`, clamped [0,1], rounded to 4 decimals.
- **Query over-fetch** -- Fetch topK*3 from Zvec when --dir or --threshold filters are active to ensure enough candidates after post-filtering.
- **Consecutive chunk merging** -- Chunks from the same file with chunkIndex differing by exactly 1 are merged; non-consecutive produce separate results.
- **--format replaces --pretty** -- Both index and query commands use `--format text` for human-readable output; --pretty removed.
- **emitError() returns never** -- Shared CLI error utility; JSON to stdout, text to stderr; return type `never` so TypeScript infers unreachable code after call.
- **JSON errors to stdout** -- Same channel as normal JSON output so agent pipelines don't need to merge stdout+stderr.
- **existsSync before loadManifest** -- loadManifest() silently returns empty manifest for missing files; always check existence first in status command.
- **byType always present** -- Status byType object always has code/text/image keys (even zeros) for predictable agent parsing.
- **Text chunking: MAX_CHUNK_CHARS=1600** -- ~400 Nomic tokens per chunk; MIN_CHUNK_CHARS=200 prevents tiny fragments.
- **pdf-parse dynamic import** -- extractPdfText() uses dynamic import('pdf-parse') to defer loading until PDF extraction is called.
- **Paragraph-boundary chunking order** -- Expand oversized paragraphs via sentence split first, then merge small pieces up to MAX_CHUNK_CHARS.
- **CLIP dtype: 'fp32' required** -- Quantized CLIP (int8/uint8) fails with "ConvInteger(10) is not implemented" in onnxruntime-node. fp32 is non-negotiable.
- **CLIPVisionModelWithProjection, not full CLIP** -- Vision-only encoder sufficient; no text encoder needed for image embeddings.
- **RawImage.fromURL needs file:// prefix** -- Prepend `file://` to absolute paths for reliable local file access across platforms.
- **dispose() cast via unknown** -- Transformers.js PreTrainedModel.dispose() returns `Promise<unknown[]>`; cast `as unknown as { dispose?: () => Promise<unknown> }` to satisfy strict TypeScript.

### Pending Todos

None yet.

### Blockers/Concerns

- Zvec concern RESOLVED: bindings confirmed working on NixOS
- WebGPU concern RESOLVED: CPU fallback confirmed working; WebGPU needs vulkan-loader config in Phase 2+

## Session Continuity

Last session: 2026-02-23
Stopped at: Phase 6 complete — all phases executed. Milestone complete.
Resume file: None
