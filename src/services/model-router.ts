/**
 * Model router — wraps Transformers.js pipeline creation with WebGPU-to-CPU fallback.
 *
 * WebGPU is attempted first. On NixOS (and most non-GPU environments), it fails and the
 * router falls back transparently to CPU with q8 quantization.
 *
 * Model cache is stored in ~/.ez-search/models/ (not the default HuggingFace cache).
 *
 * Both code and text use Qwen3-Embedding-0.6B. Output is truncated from 1024 to 768 dims
 * via Matryoshka Representation Learning, then L2-normalized.
 *
 * Query prefixing (Instruct/Query format) is the caller's responsibility.
 */

import { pipeline, env, type FeatureExtractionPipeline as FEPipeline } from '@huggingface/transformers';
import { resolveModelCachePath } from '../config/paths.js';
import { createDownloadProgressCallback } from './download-progress.js';
import type { ModelBackend } from '../types.js';

// ── Model registry ────────────────────────────────────────────────────────────

const MODEL_REGISTRY = {
  code: {
    id: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
    nativeDim: 1024,
    dim: 768,
  },
  text: {
    id: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
    nativeDim: 1024,
    dim: 768,
  },
} as const;

export type ModelType = keyof typeof MODEL_REGISTRY;

// ── Pipeline cache ────────────────────────────────────────────────────────────
// Caches loaded ONNX sessions by model ID so code+text (same model) share one load.
// Cleared explicitly via releaseAllPipelines() at end of index/query commands.

interface CachedPipeline {
  pipe: Awaited<ReturnType<typeof pipeline>>;
  backend: ModelBackend;
}

const pipelineCache = new Map<string, CachedPipeline>();
const loadingPromises = new Map<string, Promise<CachedPipeline>>();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmbeddingPipelineOptions {
  progressCallback?: (progress: unknown) => void;
  /** Custom HuggingFace ID or local path to ONNX model. Overrides registry default. */
  modelId?: string;
}

/**
 * Thin wrapper around a Transformers.js feature-extraction pipeline.
 * embed() returns one Float32Array per input string.
 */
export interface EmbeddingPipeline {
  /** Generate embeddings for a batch of strings. Returns one Float32Array per input. */
  embed(texts: string[]): Promise<Float32Array[]>;
  /** Which backend is active — 'webgpu' or 'cpu' */
  backend: ModelBackend;
  /** The HuggingFace model ID that was loaded */
  modelId: string;
  /** Embedding dimension produced by this model */
  dim: number;
  /** Whether this pipeline was served from cache (no model load occurred) */
  cached: boolean;
  /** Release resources held by the underlying pipeline (no-op with pipeline cache) */
  dispose(): Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create an EmbeddingPipeline for the given model type.
 *
 * WebGPU is attempted first. If it fails (missing Vulkan, no GPU, etc.), the router
 * falls back to CPU with q8 quantization. The active backend is logged to stderr.
 *
 * Model weights are cached in ~/.ez-search/models/ (set before first pipeline() call).
 *
 * @param modelType - 'code' or 'text', both backed by Qwen3-Embedding-0.6B (768-dim after truncation)
 */
export async function createEmbeddingPipeline(
  modelType: ModelType,
  options: EmbeddingPipelineOptions = {}
): Promise<EmbeddingPipeline> {
  const model = MODEL_REGISTRY[modelType];
  const effectiveModelId = options.modelId ?? model.id;

  // Check cache for an already-loaded pipeline with this effective model ID
  const existingCached = pipelineCache.get(effectiveModelId);
  if (existingCached) {
    return buildPipelineWrapper(existingCached.pipe, existingCached.backend, model, effectiveModelId, true);
  }

  // Check for an in-flight load (handles concurrent callers in library mode)
  const existingPromise = loadingPromises.get(effectiveModelId);
  if (existingPromise) {
    const cached = await existingPromise;
    return buildPipelineWrapper(cached.pipe, cached.backend, model, effectiveModelId, true);
  }

  // Fresh load — run WebGPU→CPU fallback logic
  const loadPromise = (async (): Promise<CachedPipeline> => {
    const cb = options.progressCallback ?? createDownloadProgressCallback(effectiveModelId);

    // Set cache dir BEFORE first pipeline() call — this is critical
    env.cacheDir = resolveModelCachePath();
    env.allowRemoteModels = true;

    let pipe: Awaited<ReturnType<typeof pipeline>>;
    let backend: ModelBackend;

    try {
      pipe = await pipeline('feature-extraction', effectiveModelId, {
        device: 'webgpu',
        dtype: 'fp32',
        progress_callback: cb,
      });
      backend = 'webgpu';
      console.error(`[model-router] Using WebGPU for ${effectiveModelId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[model-router] WebGPU unavailable: ${msg}`);
      console.error(`[model-router] Falling back to CPU (q8) for ${effectiveModelId}`);

      pipe = await pipeline('feature-extraction', effectiveModelId, {
        device: 'cpu',
        dtype: 'q8',
        progress_callback: cb,
      });
      backend = 'cpu';
      console.error(`[model-router] Using CPU for ${effectiveModelId}`);
    }

    const cached: CachedPipeline = { pipe, backend };
    pipelineCache.set(effectiveModelId, cached);
    return cached;
  })();

  loadingPromises.set(effectiveModelId, loadPromise);
  try {
    const cached = await loadPromise;
    return buildPipelineWrapper(cached.pipe, cached.backend, model, effectiveModelId, false);
  } finally {
    loadingPromises.delete(effectiveModelId);
  }
}

function buildPipelineWrapper(
  pipe: Awaited<ReturnType<typeof pipeline>>,
  backend: ModelBackend,
  model: (typeof MODEL_REGISTRY)[ModelType],
  effectiveModelId: string,
  cached: boolean,
): EmbeddingPipeline {
  return {
    backend,
    modelId: effectiveModelId,
    dim: model.dim,
    cached,

    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];

      // Single batched ONNX forward pass instead of N individual calls
      const fePipe = pipe as unknown as FEPipeline;
      const output = await fePipe(texts, { pooling: 'mean', normalize: true });
      const data = (output as { data: Float32Array }).data;
      const nativeDim = model.nativeDim;

      const results: Float32Array[] = [];
      for (let i = 0; i < texts.length; i++) {
        const offset = i * nativeDim;
        // Truncate from nativeDim (1024) to dim (768) via Matryoshka, then re-normalize
        const truncated = new Float32Array(data.buffer, data.byteOffset + offset * 4, model.dim);
        results.push(l2Normalize(new Float32Array(truncated)));
      }
      return results;
    },

    async dispose(): Promise<void> {
      // no-op — actual cleanup happens via releaseAllPipelines()
    },
  };
}

/** Release all cached ONNX sessions. Call at end of index/query commands. */
export async function releaseAllPipelines(): Promise<void> {
  for (const [, cached] of pipelineCache) {
    const p = cached.pipe as { dispose?: () => Promise<void> };
    if (typeof p.dispose === 'function') await p.dispose();
  }
  pipelineCache.clear();
  loadingPromises.clear();
}
