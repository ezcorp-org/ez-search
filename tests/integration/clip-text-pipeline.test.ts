/**
 * Integration tests for createClipTextPipeline.
 *
 * Mocks native deps (sharp, onnxruntime-node, @huggingface/transformers)
 * so that the pipeline runs without real model weights. The mock text model
 * returns deterministic 512-dim embeddings derived from input token IDs.
 */

import { describe, test, expect, mock, beforeAll, afterAll } from 'bun:test';

// ── Mock native deps (same pattern as tests/unit/chunker.test.ts) ────────────
mock.module('onnxruntime-node', () => ({
  default: {},
  InferenceSession: {},
  Tensor: {},
}));
mock.module('sharp', () => {
  const fn = () => fn;
  return { default: Object.assign(fn, { cache: fn, concurrency: fn, counters: fn, simd: fn, versions: fn }) };
});

/**
 * Deterministic embedding from token IDs: hash them into a 512-dim vector.
 * Different token sequences → different embeddings.
 */
function fakeTextEmbedding(inputIds: number[]): Float32Array {
  const emb = new Float32Array(512);
  for (let i = 0; i < inputIds.length; i++) {
    emb[(inputIds[i] * 7 + i * 13) % 512] += 1.0 + i * 0.1;
  }
  // Normalize to unit length
  let norm = 0;
  for (let i = 0; i < 512; i++) norm += emb[i] * emb[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < 512; i++) emb[i] /= norm;
  return emb;
}

/** Simple tokenizer: convert chars to char codes as token IDs */
function fakeTokenize(texts: string | string[], _opts?: unknown) {
  const arr = Array.isArray(texts) ? texts : [texts];
  const allIds: number[][] = arr.map(t => Array.from(t).map(c => c.charCodeAt(0)));
  const maxLen = Math.max(...allIds.map(ids => ids.length));
  const paddedIds = allIds.map(ids => [...ids, ...Array(maxLen - ids.length).fill(0)]);
  const paddedMask = allIds.map(ids => [...Array(ids.length).fill(1), ...Array(maxLen - ids.length).fill(0)]);
  return {
    input_ids: { data: BigInt64Array.from(paddedIds.flat().map(BigInt)), dims: [arr.length, maxLen] },
    attention_mask: { data: BigInt64Array.from(paddedMask.flat().map(BigInt)), dims: [arr.length, maxLen] },
  };
}

mock.module('@huggingface/transformers', () => ({
  env: { cacheDir: '', allowRemoteModels: false },
  pipeline: async () => {
    const fn = async () => ({ data: new Float32Array(768) });
    fn.dispose = async () => {};
    return fn;
  },
  AutoTokenizer: {
    from_pretrained: async () => Object.assign(fakeTokenize, { from_pretrained: async () => fakeTokenize }),
  },
  CLIPTextModelWithProjection: {
    from_pretrained: async () => {
      // Callable model: takes tokenized input, returns text_embeds
      return (inputs: { input_ids: { data: BigInt64Array; dims: number[] } }) => {
        const batchSize = inputs.input_ids.dims[0];
        const seqLen = inputs.input_ids.dims[1];
        const allData = new Float32Array(batchSize * 512);
        for (let b = 0; b < batchSize; b++) {
          const ids: number[] = [];
          for (let s = 0; s < seqLen; s++) ids.push(Number(inputs.input_ids.data[b * seqLen + s]));
          const emb = fakeTextEmbedding(ids);
          allData.set(emb, b * 512);
        }
        return { text_embeds: { data: allData } };
      };
    },
  },
  CLIPVisionModelWithProjection: { from_pretrained: async () => ({}) },
  AutoProcessor: { from_pretrained: async () => ({}) },
  RawImage: { fromBlob: async () => ({}) },
}));

import type { ClipTextPipeline } from '../../src/services/image-embedder.js';

describe('createClipTextPipeline', () => {
  let pipeline: ClipTextPipeline;

  beforeAll(async () => {
    const { createClipTextPipeline } = await import('../../src/services/image-embedder.js');
    pipeline = await createClipTextPipeline();
  });

  afterAll(async () => {
    if (pipeline) await pipeline.dispose();
  });

  test('pipeline has correct modelId and dim', () => {
    expect(pipeline.modelId).toBe('Xenova/clip-vit-base-patch32');
    expect(pipeline.dim).toBe(512);
  });

  test('single text → 512-dim Float32Array with finite non-zero values', async () => {
    const [embedding] = await pipeline.embedText(['a photo of a cat']);

    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(512);
    expect(embedding.some(v => v !== 0)).toBe(true);
    expect(embedding.every(v => Number.isFinite(v))).toBe(true);
  });

  test('batch of 3 texts → 3 separate 512-dim embeddings', async () => {
    const embeddings = await pipeline.embedText(['cat', 'dog', 'sunset over ocean']);

    expect(embeddings).toHaveLength(3);
    for (const emb of embeddings) {
      expect(emb).toBeInstanceOf(Float32Array);
      expect(emb.length).toBe(512);
    }
  });

  test('different texts → different embeddings', async () => {
    const [catEmb, carEmb] = await pipeline.embedText(['a photo of a cat', 'a red sports car']);

    // At least one element should differ
    let allSame = true;
    for (let i = 0; i < 512; i++) {
      if (catEmb[i] !== carEmb[i]) { allSame = false; break; }
    }
    expect(allSame).toBe(false);
  });

  test('dispose completes without error', async () => {
    await pipeline.dispose();
  });
});
