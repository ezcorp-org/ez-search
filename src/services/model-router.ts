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

import { pipeline, env } from '@huggingface/transformers';
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmbeddingPipelineOptions {
  progressCallback?: (progress: unknown) => void;
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
  /** Release resources held by the underlying pipeline */
  dispose(): Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract a flat Float32Array from a pipeline Tensor output.
 * Transformers.js returns a Tensor; we access .data for the raw values.
 */
function extractEmbedding(output: unknown): Float32Array {
  if (output && typeof output === 'object' && 'data' in output) {
    return (output as { data: Float32Array }).data;
  }
  if (output && typeof output === 'object' && 'tolist' in output) {
    const nested = (output as { tolist: () => number[][] }).tolist();
    return new Float32Array(nested.flat());
  }
  throw new Error(`Unexpected embedding output shape: ${JSON.stringify(output)}`);
}

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
  const cb = options.progressCallback ?? createDownloadProgressCallback(model.id);

  // Set cache dir BEFORE first pipeline() call — this is critical
  env.cacheDir = resolveModelCachePath();
  env.allowRemoteModels = true;

  let pipe: Awaited<ReturnType<typeof pipeline>>;
  let backend: ModelBackend;

  // Attempt WebGPU first
  try {
    pipe = await pipeline('feature-extraction', model.id, {
      device: 'webgpu',
      dtype: 'fp32',
      progress_callback: cb,
    });
    backend = 'webgpu';
    console.error(`[model-router] Using WebGPU for ${model.id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[model-router] WebGPU unavailable: ${msg}`);
    console.error(`[model-router] Falling back to CPU (q8) for ${model.id}`);

    pipe = await pipeline('feature-extraction', model.id, {
      device: 'cpu',
      dtype: 'q8',
      progress_callback: cb,
    });
    backend = 'cpu';
    console.error(`[model-router] Using CPU for ${model.id}`);
  }

  return {
    backend,
    modelId: model.id,
    dim: model.dim,

    async embed(texts: string[]): Promise<Float32Array[]> {
      const outputs = await Promise.all(
        texts.map((text) => pipe(text, { pooling: 'mean', normalize: true }))
      );
      return outputs.map((output) => {
        const raw = extractEmbedding(output);
        const truncated = new Float32Array(raw.buffer, raw.byteOffset, model.dim);
        return l2Normalize(new Float32Array(truncated));
      });
    },

    async dispose(): Promise<void> {
      if (pipe && typeof (pipe as { dispose?: () => Promise<void> }).dispose === 'function') {
        await (pipe as { dispose: () => Promise<void> }).dispose();
      }
    },
  };
}
