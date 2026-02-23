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

import { CLIPVisionModelWithProjection, AutoProcessor, RawImage, env } from '@huggingface/transformers';
import { pathToFileURL } from 'node:url';
import { resolveModelCachePath } from '../config/paths.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const CLIP_MODEL_ID = 'Xenova/clip-vit-base-patch32';
const CLIP_DIM = 512;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Embedding pipeline for image files.
 * One call to embedImage() returns one 512-dim Float32Array.
 */
export interface ImageEmbeddingPipeline {
  /** Generate a 512-dim embedding for a single image file. */
  embedImage(absolutePath: string): Promise<Float32Array>;
  /** The HuggingFace model ID that was loaded */
  readonly modelId: string;
  /** Embedding dimension — always 512 for CLIP ViT-B/32 */
  readonly dim: number;
  /** Release resources held by the vision model */
  dispose(): Promise<void>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create an ImageEmbeddingPipeline backed by CLIP ViT-B/32 (fp32).
 *
 * Loads the AutoProcessor and CLIPVisionModelWithProjection in parallel.
 * Model weights are cached in ~/.ez-search/models/.
 *
 * IMPORTANT: dtype must remain 'fp32'. Quantized variants fail in Node.js with
 * "ConvInteger(10) is not implemented" from onnxruntime-node.
 */
export async function createImageEmbeddingPipeline(): Promise<ImageEmbeddingPipeline> {
  // Set cache dir BEFORE first model load — this is critical
  env.cacheDir = resolveModelCachePath();
  env.allowRemoteModels = true;

  // Load processor and vision model in parallel for faster startup
  const [processor, visionModel] = await Promise.all([
    AutoProcessor.from_pretrained(CLIP_MODEL_ID),
    CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL_ID, {
      // fp32 is REQUIRED — do not use 'int8', 'uint8', or other quantized dtypes.
      // onnxruntime-node does not implement ConvInteger(10), which quantized CLIP uses.
      dtype: 'fp32',
    }),
  ]);

  console.error(`[image-embedder] Loaded CLIP vision model (fp32)`);

  return {
    modelId: CLIP_MODEL_ID,
    dim: CLIP_DIM,

    async embedImage(absolutePath: string): Promise<Float32Array> {
      // pathToFileURL properly encodes spaces and special characters in file paths.
      const url = absolutePath.startsWith('file://') ? absolutePath : pathToFileURL(absolutePath).href;
      const image = await RawImage.fromURL(url);

      // Preprocess: resize, normalize, convert to tensor expected by CLIP
      const inputs = await processor(image);

      // Run the vision encoder — output.image_embeds is a [1, 512] Tensor
      const output = await visionModel(inputs);

      // Extract the single embedding vector (first 512 values = one image)
      return new Float32Array(output.image_embeds.data.slice(0, CLIP_DIM));
    },

    async dispose(): Promise<void> {
      if (typeof (visionModel as unknown as Record<string, unknown>).dispose === 'function') {
        await (visionModel as unknown as { dispose: () => Promise<unknown> }).dispose();
      }
    },
  };
}
