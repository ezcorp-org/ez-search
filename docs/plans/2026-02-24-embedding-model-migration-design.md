# Embedding Model Migration Design

**Date:** 2026-02-24
**Status:** Approved

## Summary

Replace three separate embedding models with two: Qwen3-Embedding-0.6B (unified code+text) and SigLIP ViT-B/16 (images). Consolidate from two vector collections to one single 768-dim collection.

## Current State

| Pipeline | Model | Dim | Collection |
|----------|-------|-----|------------|
| Code | jinaai/jina-embeddings-v2-base-code | 768 | col-768 |
| Text | nomic-ai/nomic-embed-text-v1.5 | 768 | col-768 |
| Image | Xenova/clip-vit-base-patch16 | 512 | col-512 |

## Target State

| Pipeline | Model | Dim | Collection |
|----------|-------|-----|------------|
| Code | onnx-community/Qwen3-Embedding-0.6B-ONNX | 768 (truncated from 1024) | col-768 |
| Text | onnx-community/Qwen3-Embedding-0.6B-ONNX | 768 (truncated from 1024) | col-768 |
| Image | Xenova/siglip-base-patch16-224 | 768 | col-768 |

## Architecture

All pipelines produce 768-dim vectors stored in a single collection. File type metadata distinguishes vectors at query time.

```
Code files  -> Jina tokenizer (chunking only) -> Qwen3 (768d) -> col-768
Text files  -> paragraph chunker              -> Qwen3 (768d) -> col-768
Image files -> (no chunking)                  -> SigLIP (768d) -> col-768
```

## Key Decisions

1. **Single collection**: All vectors in col-768, filtered by modelId metadata at query time.
2. **Qwen3 dim truncation**: Default 1024 truncated to 768 via Matryoshka, then L2-normalized. Matches SigLIP's native 768.
3. **Jina tokenizer retained**: Used only for code chunk token counting, not embedding. No need to change.
4. **Schema version bump**: SCHEMA_VERSION 2->3, MANIFEST_VERSION 4->5. Forces full re-index (required since embedding spaces are incompatible).

## Query Prefixes

- **Qwen3 documents (indexing)**: No prefix
- **Qwen3 queries (search)**: `Instruct: Given a search query, retrieve relevant code or text passages\nQuery: <user query>`
- **SigLIP**: No prefix for text or image

## Files Changed

### Core
- `src/services/model-router.ts` — Qwen3 model registry, truncation + renormalization
- `src/services/image-embedder.ts` — SigLIP replaces CLIP (SiglipVisionModel, SiglipTextModel, pooler_output)
- `src/services/vector-db.ts` — Remove col-512, single col-768, bump SCHEMA_VERSION
- `src/services/manifest-cache.ts` — Bump MANIFEST_VERSION

### Pipeline
- `src/cli/commands/index-cmd.ts` — Images to col768, remove nomic prefix, update comments
- `src/cli/commands/query-cmd.ts` — All queries hit col768, new model filters, Qwen3 instruct prefix

### Tests
- `tests/integration/clip-text-pipeline.test.ts` — 512->768, SigLIP model IDs
- `tests/integration/text-to-image-query.test.ts` — 512->768, single collection
- `tests/unit/query-utils.test.ts` — Updated model ID fixtures
- `tests/accuracy/accuracy.test.ts` — Recalibrate thresholds if needed
