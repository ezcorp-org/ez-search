/**
 * Unit tests for model-router.ts -- embedding pipeline creation,
 * WebGPU-to-CPU fallback, caching, L2-normalization, and Matryoshka truncation.
 *
 * All native deps are mocked so tests run without real model weights.
 */

import { describe, test, expect, mock, beforeAll, beforeEach, spyOn } from 'bun:test';

// ── Mock native deps (before any imports that trigger the dependency chain) ──

mock.module('onnxruntime-node', () => ({
  default: {},
  InferenceSession: {},
  Tensor: {},
}));
mock.module('sharp', () => {
  const fn = () => fn;
  return { default: Object.assign(fn, { cache: fn, concurrency: fn, counters: fn, simd: fn, versions: fn }) };
});

// ── Configurable mock for @huggingface/transformers ─────────────────────────

/** Controls whether the mock pipeline() should fail on WebGPU */
let webgpuShouldFail = true;

/** Tracks calls to the mock pipeline() for assertions */
let pipelineCalls: Array<{ task: string; model: string; opts: Record<string, unknown> }> = [];

/** Tracks dispose calls on the underlying mock pipe */
let disposeCallCount = 0;

/**
 * The native dimension of the model (1024). The mock returns this many floats
 * per input text so that Matryoshka truncation to 768 can be tested.
 */
const NATIVE_DIM = 1024;

/**
 * Build a deterministic, UN-NORMALIZED embedding of nativeDim floats.
 * Values are derived from the input string so different strings produce
 * different embeddings. Deliberately not unit-length so we can verify
 * that L2-normalization is applied by the production code.
 */
function fakeEmbedding(text: string): Float32Array {
  const emb = new Float32Array(NATIVE_DIM);
  for (let i = 0; i < text.length; i++) {
    emb[(text.charCodeAt(i) * 7 + i * 13) % NATIVE_DIM] += 5.0 + i * 2.0;
  }
  return emb;
}

mock.module('@huggingface/transformers', () => ({
  env: { cacheDir: '', allowRemoteModels: false },

  pipeline: async (_task: string, model: string, opts: Record<string, unknown>) => {
    pipelineCalls.push({ task: _task, model, opts });

    if (opts.device === 'webgpu' && webgpuShouldFail) {
      throw new Error('WebGPU not available');
    }

    // Return a callable mock pipeline (FEPipeline shape)
    const fn = async (texts: string[], _pipeOpts?: unknown) => {
      const data = new Float32Array(texts.length * NATIVE_DIM);
      for (let i = 0; i < texts.length; i++) {
        data.set(fakeEmbedding(texts[i]), i * NATIVE_DIM);
      }
      return { data };
    };
    fn.dispose = async () => { disposeCallCount++; };
    return fn;
  },

  // Exports needed for module resolution across the full test suite
  AutoTokenizer: { from_pretrained: async () => ({}) },
  CLIPTextModelWithProjection: { from_pretrained: async () => (() => ({ text_embeds: { data: new Float32Array(512) } })) },
  CLIPVisionModelWithProjection: { from_pretrained: async () => ({}) },
  AutoProcessor: { from_pretrained: async () => ({}) },
  RawImage: { fromBlob: async () => ({}) },
}));

// ── Dynamic import so mocks are registered first ────────────────────────────

let createEmbeddingPipeline: typeof import('../../src/services/model-router').createEmbeddingPipeline;
let releaseAllPipelines: typeof import('../../src/services/model-router').releaseAllPipelines;

beforeAll(async () => {
  const mod = await import('../../src/services/model-router.js');
  createEmbeddingPipeline = mod.createEmbeddingPipeline;
  releaseAllPipelines = mod.releaseAllPipelines;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('model-router', () => {
  let stderrSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    // Reset state between tests
    await releaseAllPipelines();
    pipelineCalls = [];
    disposeCallCount = 0;
    webgpuShouldFail = true;
    stderrSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  // ── createEmbeddingPipeline: basic properties ───────────────────────────

  describe('createEmbeddingPipeline', () => {
    test('returns pipeline with correct properties', async () => {
      const p = await createEmbeddingPipeline('code');

      expect(p.modelId).toBe('onnx-community/Qwen3-Embedding-0.6B-ONNX');
      expect(p.dim).toBe(768);
      expect(typeof p.backend).toBe('string');
      expect(['webgpu', 'cpu']).toContain(p.backend);
      expect(typeof p.embed).toBe('function');
      expect(typeof p.dispose).toBe('function');
      expect(p.cached).toBe(false);
    });

    test('text model type also works and shares the same model ID', async () => {
      const p = await createEmbeddingPipeline('text');
      expect(p.modelId).toBe('onnx-community/Qwen3-Embedding-0.6B-ONNX');
      expect(p.dim).toBe(768);
    });
  });

  // ── WebGPU to CPU fallback ──────────────────────────────────────────────

  describe('WebGPU to CPU fallback', () => {
    test('falls back to CPU when WebGPU fails', async () => {
      webgpuShouldFail = true;
      const p = await createEmbeddingPipeline('code');

      expect(p.backend).toBe('cpu');
      // Should have attempted WebGPU first, then CPU
      expect(pipelineCalls.length).toBe(2);
      expect(pipelineCalls[0].opts.device).toBe('webgpu');
      expect(pipelineCalls[1].opts.device).toBe('cpu');
      expect(pipelineCalls[1].opts.dtype).toBe('q8');
    });

    test('uses WebGPU when available', async () => {
      webgpuShouldFail = false;
      const p = await createEmbeddingPipeline('code');

      expect(p.backend).toBe('webgpu');
      expect(pipelineCalls.length).toBe(1);
      expect(pipelineCalls[0].opts.device).toBe('webgpu');
      expect(pipelineCalls[0].opts.dtype).toBe('fp32');
    });

    test('logs fallback messages to stderr', async () => {
      webgpuShouldFail = true;
      await createEmbeddingPipeline('code');

      const messages = stderrSpy.mock.calls.map(c => c[0]);
      expect(messages.some((m: string) => m.includes('WebGPU unavailable'))).toBe(true);
      expect(messages.some((m: string) => m.includes('Falling back to CPU'))).toBe(true);
      expect(messages.some((m: string) => m.includes('Using CPU'))).toBe(true);
    });
  });

  // ── Pipeline caching ───────────────────────────────────────────────────

  describe('pipeline caching', () => {
    test('second call returns cached pipeline', async () => {
      const first = await createEmbeddingPipeline('code');
      expect(first.cached).toBe(false);

      const second = await createEmbeddingPipeline('code');
      expect(second.cached).toBe(true);

      // Only one set of underlying pipeline() calls (webgpu fail + cpu)
      expect(pipelineCalls.length).toBe(2);
    });

    test('code and text share the same cached pipeline', async () => {
      const code = await createEmbeddingPipeline('code');
      expect(code.cached).toBe(false);

      const text = await createEmbeddingPipeline('text');
      expect(text.cached).toBe(true);

      // Same backend since they share the pipeline
      expect(text.backend).toBe(code.backend);
    });
  });

  // ── Concurrent load deduplication ──────────────────────────────────────

  describe('concurrent load deduplication', () => {
    test('two simultaneous calls share one loading promise', async () => {
      const [a, b] = await Promise.all([
        createEmbeddingPipeline('code'),
        createEmbeddingPipeline('text'),
      ]);

      // Only one load should have occurred (2 calls: webgpu fail + cpu success)
      expect(pipelineCalls.length).toBe(2);

      // First caller gets cached=false, second gets cached=true
      const cachedValues = [a.cached, b.cached].sort();
      expect(cachedValues).toEqual([false, true]);
    });
  });

  // ── L2 normalization ──────────────────────────────────────────────────

  describe('L2 normalization', () => {
    test('output vectors are unit-length', async () => {
      const p = await createEmbeddingPipeline('code');
      const embeddings = await p.embed(['hello world', 'function foo() {}']);

      expect(embeddings.length).toBe(2);
      for (const vec of embeddings) {
        let normSq = 0;
        for (let i = 0; i < vec.length; i++) normSq += vec[i] * vec[i];
        const norm = Math.sqrt(normSq);
        expect(Math.abs(norm - 1.0)).toBeLessThan(1e-5);
      }
    });

    test('different inputs produce different embeddings', async () => {
      const p = await createEmbeddingPipeline('code');
      const [a, b] = await p.embed(['hello', 'world']);

      let same = true;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) { same = false; break; }
      }
      expect(same).toBe(false);
    });
  });

  // ── Matryoshka dimension truncation ───────────────────────────────────

  describe('Matryoshka dimension truncation', () => {
    test('1024-dim native output is truncated to 768', async () => {
      const p = await createEmbeddingPipeline('code');
      const [vec] = await p.embed(['test input']);

      expect(vec.length).toBe(768);
      expect(vec).toBeInstanceOf(Float32Array);
    });

    test('truncated + normalized vectors are still unit-length', async () => {
      const p = await createEmbeddingPipeline('code');
      const [vec] = await p.embed(['another test']);

      let normSq = 0;
      for (let i = 0; i < vec.length; i++) normSq += vec[i] * vec[i];
      expect(Math.abs(Math.sqrt(normSq) - 1.0)).toBeLessThan(1e-5);
    });
  });

  // ── releaseAllPipelines ───────────────────────────────────────────────

  describe('releaseAllPipelines', () => {
    test('disposes all cached pipelines and clears cache', async () => {
      await createEmbeddingPipeline('code');
      expect(disposeCallCount).toBe(0);

      await releaseAllPipelines();
      expect(disposeCallCount).toBe(1);

      // After release, next call should create fresh (not cached)
      pipelineCalls = [];
      const p = await createEmbeddingPipeline('code');
      expect(p.cached).toBe(false);
      expect(pipelineCalls.length).toBeGreaterThan(0);
    });
  });

  // ── dispose on individual pipeline wrapper ────────────────────────────

  describe('dispose on individual pipeline wrapper', () => {
    test('is a no-op (does not dispose underlying pipeline)', async () => {
      const p = await createEmbeddingPipeline('code');
      await p.dispose();

      // Underlying pipe should NOT have been disposed
      expect(disposeCallCount).toBe(0);

      // Pipeline should still be functional after dispose()
      const embeddings = await p.embed(['still works']);
      expect(embeddings.length).toBe(1);
      expect(embeddings[0].length).toBe(768);
    });
  });

  // ── Empty input ───────────────────────────────────────────────────────

  describe('empty input', () => {
    test('embed([]) returns empty array', async () => {
      const p = await createEmbeddingPipeline('code');
      const result = await p.embed([]);

      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
