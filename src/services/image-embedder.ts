/**
 * SigLIP image embedding service — converts image files to 768-dim Float32Array embeddings.
 *
 * Uses SiglipVisionModel (not the full SigLIP model) with fp32 dtype.
 *
 * Supported formats: .jpg, .jpeg, .png, .webp (anything RawImage can decode).
 *
 * One image produces one 768-dim vector — no chunking is performed.
 * Model weights are cached in ~/.ez-search/models/ alongside text/code models.
 */

import { SiglipVisionModel, SiglipTextModel, AutoProcessor, AutoTokenizer, RawImage, env } from '@huggingface/transformers';
import { resolveModelCachePath } from '../config/paths.js';
import { createDownloadProgressCallback } from './download-progress.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SIGLIP_MODEL_ID = 'Xenova/siglip-base-patch16-224';
const SIGLIP_DIM = 768;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Text-to-image embedding pipeline using SigLIP's text encoder.
 * Encodes text queries into the same 768-dim space as SigLIP image embeddings.
 */
export interface SiglipTextPipeline {
  embedText(texts: string[]): Promise<Float32Array[]>;
  readonly modelId: string;
  readonly dim: number;
  dispose(): Promise<void>;
}

/**
 * Embedding pipeline for image files.
 * One call to embedImage() returns one 768-dim Float32Array.
 */
export interface ImageEmbeddingPipeline {
  /** Generate a 768-dim embedding from an image buffer. */
  embedImage(buf: Buffer | Uint8Array): Promise<Float32Array>;
  /** The HuggingFace model ID that was loaded */
  readonly modelId: string;
  /** Embedding dimension — always 768 for SigLIP ViT-B/16 */
  readonly dim: number;
  /** Release resources held by the vision model */
  dispose(): Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * L2-normalize a vector in-place.
 *
 * SiglipVisionModel and SiglipTextModel do NOT
 * normalize their output — only the full SigLIP model does. Without this,
 * cosine distances in Zvec are meaningless (all scores collapse to ~0.21).
 */
function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create an ImageEmbeddingPipeline backed by SigLIP ViT-B/16 (fp32).
 *
 * Loads the AutoProcessor and SiglipVisionModel in parallel.
 * Model weights are cached in ~/.ez-search/models/.
 */
export async function createImageEmbeddingPipeline(): Promise<ImageEmbeddingPipeline> {
  // Set cache dir BEFORE first model load — this is critical
  env.cacheDir = resolveModelCachePath();
  env.allowRemoteModels = true;

  const cb = createDownloadProgressCallback(SIGLIP_MODEL_ID);

  // Load processor and vision model in parallel for faster startup
  const [processor, visionModel] = await Promise.all([
    AutoProcessor.from_pretrained(SIGLIP_MODEL_ID, { progress_callback: cb }),
    SiglipVisionModel.from_pretrained(SIGLIP_MODEL_ID, {
      dtype: 'fp32',
      progress_callback: cb,
    }),
  ]);

  console.error(`[image-embedder] Loaded SigLIP vision model (fp32)`);

  return {
    modelId: SIGLIP_MODEL_ID,
    dim: SIGLIP_DIM,

    async embedImage(buf: Buffer | Uint8Array): Promise<Float32Array> {
      // Use fromBlob instead of file:// URLs to avoid encoding issues with
      // special Unicode characters in filenames (e.g. macOS narrow no-break spaces).
      const image = await RawImage.fromBlob(new Blob([new Uint8Array(buf)]));

      // Preprocess: resize, normalize, convert to tensor expected by SigLIP
      const inputs = await processor(image);

      // Run the vision encoder — output.pooler_output is a [1, 768] Tensor
      const output = await visionModel(inputs);

      // Extract and L2-normalize (projection models don't normalize)
      return l2Normalize(new Float32Array(output.pooler_output.data.slice(0, SIGLIP_DIM)));
    },

    async dispose(): Promise<void> {
      if (typeof (visionModel as unknown as Record<string, unknown>).dispose === 'function') {
        await (visionModel as unknown as { dispose: () => Promise<unknown> }).dispose();
      }
    },
  };
}

/**
 * Create a SiglipTextPipeline backed by SigLIP ViT-B/16 (fp32).
 *
 * Loads AutoTokenizer and SiglipTextModel in parallel.
 * Used for text-to-image search: encode query text into SigLIP's 768-dim space,
 * then find nearest image embeddings.
 */
export async function createSiglipTextPipeline(): Promise<SiglipTextPipeline> {
  env.cacheDir = resolveModelCachePath();
  env.allowRemoteModels = true;

  const cb = createDownloadProgressCallback(SIGLIP_MODEL_ID);

  const [tokenizer, textModel] = await Promise.all([
    AutoTokenizer.from_pretrained(SIGLIP_MODEL_ID, { progress_callback: cb }),
    SiglipTextModel.from_pretrained(SIGLIP_MODEL_ID, { dtype: 'fp32', progress_callback: cb }),
  ]);

  console.error(`[image-embedder] Loaded SigLIP text model (fp32)`);

  return {
    modelId: SIGLIP_MODEL_ID,
    dim: SIGLIP_DIM,

    async embedText(texts: string[]): Promise<Float32Array[]> {
      const inputs = tokenizer(texts, { padding: true, truncation: true });
      const output = await textModel(inputs);
      const data = output.pooler_output.data as Float32Array;

      const embeddings: Float32Array[] = [];
      for (let i = 0; i < texts.length; i++) {
        embeddings.push(l2Normalize(new Float32Array(data.slice(i * SIGLIP_DIM, (i + 1) * SIGLIP_DIM))));
      }
      return embeddings;
    },

    async dispose(): Promise<void> {
      if (typeof (textModel as unknown as Record<string, unknown>).dispose === 'function') {
        await (textModel as unknown as { dispose: () => Promise<unknown> }).dispose();
      }
    },
  };
}
