/**
 * Unit tests for src/services/image-embedder.ts
 *
 * Mocks @huggingface/transformers and native deps so tests run without
 * real model weights. Validates pipeline creation, embedding dimensions,
 * L2 normalization, and resource disposal.
 */

import { describe, test, expect, mock, beforeAll, afterAll } from 'bun:test';

// ── Mock native deps ──────────────────────────────────────────────────────────
mock.module('onnxruntime-node', () => ({
  default: {},
  InferenceSession: {},
  Tensor: {},
}));
mock.module('sharp', () => {
  const fn = () => fn;
  return { default: Object.assign(fn, { cache: fn, concurrency: fn, counters: fn, simd: fn, versions: fn }) };
});

// ── Fake embedding helpers ────────────────────────────────────────────────────

/**
 * Generate a deterministic UN-NORMALIZED 512-dim vector from a seed.
 * The large magnitude ensures l2Normalize must run for norm to equal 1.
 */
function makeUnNormalizedEmbedding(seed: number): Float32Array {
  const emb = new Float32Array(512);
  for (let i = 0; i < 512; i++) emb[i] = 0.3 + (i * seed) % 7;
  emb[seed % 512] = 10.0;
  return emb;
}

/** Simple tokenizer: converts chars to char codes as token IDs */
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

// ── Track dispose calls ───────────────────────────────────────────────────────
let visionDisposeCount = 0;
let textDisposeCount = 0;

mock.module('@huggingface/transformers', () => ({
  env: { cacheDir: '', allowRemoteModels: false },
  pipeline: async () => {
    const fn = async () => ({ data: new Float32Array(512) });
    fn.dispose = async () => {};
    return fn;
  },
  AutoProcessor: {
    from_pretrained: async () => {
      // Processor: accepts an image, returns tensor inputs for vision model
      return async (_image: unknown) => ({ pixel_values: { data: new Float32Array(224 * 224 * 3) } });
    },
  },
  CLIPVisionModelWithProjection: {
    from_pretrained: async () => {
      const model = async (_inputs: unknown) => ({
        image_embeds: { data: makeUnNormalizedEmbedding(42) },
      });
      (model as Record<string, unknown>).dispose = async () => { visionDisposeCount++; };
      return model;
    },
  },
  AutoTokenizer: {
    from_pretrained: async () => fakeTokenize,
  },
  CLIPTextModelWithProjection: {
    from_pretrained: async () => {
      const model = (inputs: { input_ids: { data: BigInt64Array; dims: number[] } }) => {
        const batchSize = inputs.input_ids.dims[0];
        const seqLen = inputs.input_ids.dims[1];
        const allData = new Float32Array(batchSize * 512);
        for (let b = 0; b < batchSize; b++) {
          // Derive seed from first token to get different embeddings per text
          const firstToken = Number(inputs.input_ids.data[b * seqLen]);
          allData.set(makeUnNormalizedEmbedding(firstToken), b * 512);
        }
        return { text_embeds: { data: allData } };
      };
      (model as Record<string, unknown>).dispose = async () => { textDisposeCount++; };
      return model;
    },
  },
  RawImage: {
    fromBlob: async () => ({ width: 224, height: 224 }),
  },
}));

// ── Import under test (after mocks) ──────────────────────────────────────────
import type { ImageEmbeddingPipeline, ClipTextPipeline } from '../../src/services/image-embedder.js';

/** Compute L2 norm of a vector */
function l2Norm(vec: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  return Math.sqrt(sum);
}

// ── Tests: createImageEmbeddingPipeline ───────────────────────────────────────

describe('createImageEmbeddingPipeline', () => {
  let pipeline: ImageEmbeddingPipeline;

  beforeAll(async () => {
    visionDisposeCount = 0;
    const { createImageEmbeddingPipeline } = await import('../../src/services/image-embedder.js');
    pipeline = await createImageEmbeddingPipeline();
  });

  test('returns pipeline with correct modelId', () => {
    expect(pipeline.modelId).toBe('Xenova/clip-vit-base-patch16');
  });

  test('returns pipeline with dim=512', () => {
    expect(pipeline.dim).toBe(512);
  });

  test('embedImage returns Float32Array of length 512', async () => {
    const buf = Buffer.from('fake-image-data');
    const embedding = await pipeline.embedImage(buf);

    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(512);
  });

  test('embedImage returns L2-normalized vector (unit length)', async () => {
    const buf = Buffer.from('fake-image-data');
    const embedding = await pipeline.embedImage(buf);

    const norm = l2Norm(embedding);
    expect(norm).toBeCloseTo(1.0, 4);
  });

  test('embedImage returns finite non-zero values', async () => {
    const buf = Buffer.from('fake-image-data');
    const embedding = await pipeline.embedImage(buf);

    expect(embedding.every(v => Number.isFinite(v))).toBe(true);
    expect(embedding.some(v => v !== 0)).toBe(true);
  });

  test('embedImage accepts Uint8Array input', async () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const embedding = await pipeline.embedImage(buf);

    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(512);
    expect(l2Norm(embedding)).toBeCloseTo(1.0, 4);
  });

  test('dispose calls underlying model dispose', async () => {
    const before = visionDisposeCount;
    await pipeline.dispose();
    expect(visionDisposeCount).toBe(before + 1);
  });
});

// ── Tests: createImageEmbeddingPipeline with custom modelId ───────────────────

describe('createImageEmbeddingPipeline with custom modelId', () => {
  let pipeline: ImageEmbeddingPipeline;

  beforeAll(async () => {
    const { createImageEmbeddingPipeline } = await import('../../src/services/image-embedder.js');
    pipeline = await createImageEmbeddingPipeline({ modelId: 'my-org/custom-clip' });
  });

  test('uses custom modelId', () => {
    expect(pipeline.modelId).toBe('my-org/custom-clip');
  });

  test('retains dim=512', () => {
    expect(pipeline.dim).toBe(512);
  });

  test('embedImage still works with custom model', async () => {
    const buf = Buffer.from('fake-image-data');
    const embedding = await pipeline.embedImage(buf);
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(512);
  });
});

// ── Tests: createClipTextPipeline with custom modelId ─────────────────────────

describe('createClipTextPipeline with custom modelId', () => {
  let pipeline: ClipTextPipeline;

  beforeAll(async () => {
    const { createClipTextPipeline } = await import('../../src/services/image-embedder.js');
    pipeline = await createClipTextPipeline({ modelId: 'my-org/custom-clip' });
  });

  test('uses custom modelId', () => {
    expect(pipeline.modelId).toBe('my-org/custom-clip');
  });

  test('retains dim=512', () => {
    expect(pipeline.dim).toBe(512);
  });

  test('embedText still works with custom model', async () => {
    const [embedding] = await pipeline.embedText(['test query']);
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(512);
  });
});

// ── Tests: createClipTextPipeline ─────────────────────────────────────────────

describe('createClipTextPipeline', () => {
  let pipeline: ClipTextPipeline;

  beforeAll(async () => {
    textDisposeCount = 0;
    const { createClipTextPipeline } = await import('../../src/services/image-embedder.js');
    pipeline = await createClipTextPipeline();
  });

  test('returns pipeline with correct modelId', () => {
    expect(pipeline.modelId).toBe('Xenova/clip-vit-base-patch16');
  });

  test('returns pipeline with dim=512', () => {
    expect(pipeline.dim).toBe(512);
  });

  test('embedText returns L2-normalized Float32Array of dim 512', async () => {
    const [embedding] = await pipeline.embedText(['a photo of a cat']);

    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(512);
    expect(l2Norm(embedding)).toBeCloseTo(1.0, 4);
  });

  test('embedText returns finite non-zero values', async () => {
    const [embedding] = await pipeline.embedText(['test query']);

    expect(embedding.every(v => Number.isFinite(v))).toBe(true);
    expect(embedding.some(v => v !== 0)).toBe(true);
  });

  test('embedText with empty array returns empty array', async () => {
    const embeddings = await pipeline.embedText([]);

    expect(embeddings).toEqual([]);
    expect(embeddings.length).toBe(0);
  });

  test('batch of 3 texts returns 3 separate 512-dim embeddings', async () => {
    const embeddings = await pipeline.embedText(['cat', 'dog', 'sunset']);

    expect(embeddings).toHaveLength(3);
    for (const emb of embeddings) {
      expect(emb).toBeInstanceOf(Float32Array);
      expect(emb.length).toBe(512);
    }
  });

  test('each embedding in batch is independently L2-normalized', async () => {
    const embeddings = await pipeline.embedText(['alpha', 'beta', 'gamma']);

    for (const emb of embeddings) {
      expect(l2Norm(emb)).toBeCloseTo(1.0, 4);
    }
  });

  test('different texts produce different embeddings', async () => {
    const [embA, embB] = await pipeline.embedText(['cat on a mat', 'red sports car']);

    let allSame = true;
    for (let i = 0; i < 512; i++) {
      if (embA[i] !== embB[i]) { allSame = false; break; }
    }
    expect(allSame).toBe(false);
  });

  test('dispose calls underlying model dispose', async () => {
    const before = textDisposeCount;
    await pipeline.dispose();
    expect(textDisposeCount).toBe(before + 1);
  });
});
