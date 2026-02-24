/**
 * CLIP image embedding service — converts image files to 512-dim Float32Array embeddings.
 *
 * Uses CLIPVisionModelWithProjection (not the full CLIP model) with fp32 dtype.
 * Quantized variants (int8, uint8) fail in onnxruntime-node with:
 *   "ConvInteger(10) is not implemented"
 * Therefore, dtype: 'fp32' is REQUIRED and must not be changed.
 *
 * Supported formats: .jpg, .jpeg, .png, .webp (anything RawImage can decode).
 *
 * One image produces one 512-dim vector — no chunking is performed.
 * Model weights are cached in ~/.ez-search/models/ alongside text/code models.
 */

import { CLIPVisionModelWithProjection, CLIPTextModelWithProjection, AutoProcessor, AutoTokenizer, RawImage, env } from '@huggingface/transformers';
import { resolveModelCachePath } from '../config/paths.js';
import { createDownloadProgressCallback } from './download-progress.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const CLIP_MODEL_ID = 'Xenova/clip-vit-base-patch16';
const CLIP_DIM = 512;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Text-to-image embedding pipeline using CLIP's text encoder.
 * Encodes text queries into the same 512-dim space as CLIP image embeddings.
 */
export interface ClipTextPipeline {
  embedText(texts: string[]): Promise<Float32Array[]>;
  readonly modelId: string;
  readonly dim: number;
  dispose(): Promise<void>;
}

/**
 * Embedding pipeline for image files.
 * One call to embedImage() returns one 512-dim Float32Array.
 */
export interface ImageEmbeddingPipeline {
  /** Generate a 512-dim embedding from an image buffer. */
  embedImage(buf: Buffer | Uint8Array): Promise<Float32Array>;
  /** The HuggingFace model ID that was loaded */
  readonly modelId: string;
  /** Embedding dimension — always 512 for CLIP ViT-B/16 */
  readonly dim: number;
  /** Release resources held by the vision model */
  dispose(): Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * L2-normalize a vector in-place.
 *
 * CLIPVisionModelWithProjection and CLIPTextModelWithProjection do NOT
 * normalize their output — only the full CLIPModel does. Without this,
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
 * Create an ImageEmbeddingPipeline backed by CLIP ViT-B/16 (fp32).
 *
 * Loads the AutoProcessor and CLIPVisionModelWithProjection in parallel.
 * Model weights are cached in ~/.ez-search/models/.
 */
export async function createImageEmbeddingPipeline(): Promise<ImageEmbeddingPipeline> {
  env.cacheDir = resolveModelCachePath();
  env.allowRemoteModels = true;

  const cb = createDownloadProgressCallback(CLIP_MODEL_ID);

  const [processor, visionModel] = await Promise.all([
    AutoProcessor.from_pretrained(CLIP_MODEL_ID, { progress_callback: cb }),
    CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL_ID, {
      dtype: 'fp32',
      progress_callback: cb,
    }),
  ]);

  console.error(`[image-embedder] Loaded CLIP vision model (fp32)`);

  return {
    modelId: CLIP_MODEL_ID,
    dim: CLIP_DIM,

    async embedImage(buf: Buffer | Uint8Array): Promise<Float32Array> {
      const image = await RawImage.fromBlob(new Blob([new Uint8Array(buf)]));
      const inputs = await processor(image);
      const output = await visionModel(inputs);
      return l2Normalize(new Float32Array(output.image_embeds.data.slice(0, CLIP_DIM)));
    },

    async dispose(): Promise<void> {
      if (typeof (visionModel as unknown as Record<string, unknown>).dispose === 'function') {
        await (visionModel as unknown as { dispose: () => Promise<unknown> }).dispose();
      }
    },
  };
}

/**
 * Create a ClipTextPipeline backed by CLIP ViT-B/16 (fp32).
 *
 * Loads AutoTokenizer and CLIPTextModelWithProjection in parallel.
 * Used for text-to-image search: encode query text into CLIP's 512-dim space,
 * then find nearest image embeddings.
 */
export async function createClipTextPipeline(): Promise<ClipTextPipeline> {
  env.cacheDir = resolveModelCachePath();
  env.allowRemoteModels = true;

  const cb = createDownloadProgressCallback(CLIP_MODEL_ID);

  const [tokenizer, textModel] = await Promise.all([
    AutoTokenizer.from_pretrained(CLIP_MODEL_ID, { progress_callback: cb }),
    CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL_ID, { dtype: 'fp32', progress_callback: cb }),
  ]);

  console.error(`[image-embedder] Loaded CLIP text model (fp32)`);

  return {
    modelId: CLIP_MODEL_ID,
    dim: CLIP_DIM,

    async embedText(texts: string[]): Promise<Float32Array[]> {
      const inputs = tokenizer(texts, { padding: true, truncation: true });
      const output = await textModel(inputs);
      const data = output.text_embeds.data as Float32Array;

      const embeddings: Float32Array[] = [];
      for (let i = 0; i < texts.length; i++) {
        embeddings.push(l2Normalize(new Float32Array(data.slice(i * CLIP_DIM, (i + 1) * CLIP_DIM))));
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
