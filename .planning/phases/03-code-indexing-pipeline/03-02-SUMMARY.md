---
phase: 03-code-indexing-pipeline
plan: 02
subsystem: chunking
tags: [tokenizer, chunking, jina, transformers-js, sliding-window, line-tracking]

dependency-graph:
  requires:
    - 02-foundation-and-infrastructure (resolveModelCachePath from paths.ts)
    - 03-01 (research: Jina tokenizer encode/decode verification)
  provides:
    - Token-accurate chunker service with line number tracking
    - Exported Chunk interface used by index-cmd.ts
    - CHUNK_SIZE and OVERLAP constants for logging/documentation
  affects:
    - 03-03 (index-cmd.ts will import loadTokenizer and chunkFile)
    - 03-04+ (manifest-cache uses Chunk interface for chunk records)

tech-stack:
  added: []
  patterns:
    - Sliding window chunking (500 tokens, 50 overlap, 450 stride)
    - Cumulative token count per line for O(n_lines) line-number lookup
    - Tokenizer loaded once externally and passed into pure chunkFile()
    - add_special_tokens: false (pipeline adds them at inference time)

key-files:
  created:
    - src/services/chunker.ts
  modified: []

decisions:
  - id: tokenizer-singleton
    choice: Load tokenizer once via loadTokenizer(), pass to chunkFile()
    rationale: AutoTokenizer.from_pretrained() takes ~1s from disk; loading per file would add 500s on large codebases

metrics:
  duration: 44s
  completed: 2026-02-22
---

# Phase 3 Plan 2: Chunker Service Summary

**One-liner:** Token-accurate Jina BPE chunker with 500/50 sliding window and cumulative-per-line token counts for 1-indexed line tracking.

## What Was Built

`src/services/chunker.ts` — the chunker service that splits source code files into token-accurate overlapping chunks for the indexing pipeline.

### Exports

| Export | Type | Purpose |
|--------|------|---------|
| `CHUNK_SIZE` | `const number` | 500 — tokens per chunk window |
| `OVERLAP` | `const number` | 50 — token overlap between windows |
| `Chunk` | `interface` | `{ text, lineStart, lineEnd, chunkIndex, tokenCount }` |
| `loadTokenizer()` | `async function` | Loads Jina tokenizer from model cache |
| `chunkFile()` | `function` | Splits text into overlapping token windows |

### Algorithm

1. **Build cumulative token counts per line** — each line (with its trailing `\n`) is encoded independently. This gives an array where `cumulative[i]` is the total tokens consumed through line `i`. Used for O(n_lines) token-index-to-line-number lookup.

2. **Encode full text** — `tokenizer.encode(text, { add_special_tokens: false })` gives the full token ID array. `add_special_tokens: false` because the embedding pipeline adds `[CLS]`/`[SEP]` at inference time; double-adding corrupts embeddings.

3. **Single-chunk path** — if `totalTokens <= 500`, return one chunk spanning all lines.

4. **Sliding window** — stride of 450 (500 - 50). Each window: slice token IDs, decode to text, map start/end token indices to line numbers via `tokenIndexToLine()`.

5. **tokenIndexToLine()** — linear scan of cumulative array; returns `i + 1` for first index where `tokenIdx < cumulative[i]`.

### Key Implementation Notes

- `tokenizer.encode()` returns an array-like object, not a plain `Array` — used `(ids as unknown as { length: number }).length` for cumulative building and `Array.from(allIds).slice()` for window slicing
- `decode()` takes a true array — `Array.from()` conversion needed before passing chunk IDs
- Tokenizer is never called inside `chunkFile()` — always passed in from the caller

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tokenizer loading | `loadTokenizer()` separate from `chunkFile()` | Loading per-file would take ~500s on 500-file codebase |
| Special tokens | `add_special_tokens: false` everywhere | Pipeline adds them at inference; double-adding corrupts embeddings |
| allIds handling | Cast via `unknown as number[]` then `Array.from()` for slice | encode() return is array-like but not plain Array |

## Verification Results

- `npx tsc --noEmit` — zero errors
- All 5 expected exports present: `loadTokenizer`, `chunkFile`, `Chunk`, `CHUNK_SIZE`, `OVERLAP`
- `add_special_tokens: false` used in both encode calls (per-line and full-text)
- Constants `CHUNK_SIZE=500` and `OVERLAP=50` exported for callers

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

- **03-03 (manifest-cache):** Ready. `Chunk` interface exported for `ChunkRecord` tracking.
- **03-04 (index-cmd.ts):** Ready. `loadTokenizer()` + `chunkFile()` ready to wire with `scanFiles()` and `embed()`.
- No blockers or concerns.
