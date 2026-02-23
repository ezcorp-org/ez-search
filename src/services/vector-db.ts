/**
 * Vector DB service — wraps @zvec/zvec behind a clean interface.
 *
 * Uses createRequire because @zvec/zvec is a CommonJS package in an ESM project.
 * Two collections per project:
 *   col-768 — for code/text embeddings (jina, nomic, 768-dim)
 *   col-512 — for image embeddings (CLIP, 512-dim)
 */

import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import * as path from 'path';
import { resolveProjectStoragePath } from '../config/paths.js';

const require = createRequire(import.meta.url);

const {
  ZVecCreateAndOpen,
  ZVecCollectionSchema,
  ZVecDataType,
  ZVecIndexType,
  ZVecMetricType,
  ZVecInitialize,
  ZVecLogLevel,
} = require('@zvec/zvec') as typeof import('@zvec/zvec');

// Initialize Zvec at module level — suppress noisy logs
ZVecInitialize({ logLevel: ZVecLogLevel.WARN });

// ── Types ─────────────────────────────────────────────────────────────────────

export type VectorMetadata = Record<string, string | number>;

export interface QueryResult {
  id: string;
  distance: number;
  metadata: VectorMetadata;
}

/**
 * Thin wrapper around a Zvec collection handle.
 *
 * COSINE metric semantics: distance 0 = exact match, ascending = less similar.
 * Call optimize() after bulk inserts for 10x query speedup.
 * IDs must NOT contain colons — use underscores or hyphens only.
 */
export interface VectorCollection {
  insert(id: string, embedding: Float32Array, metadata: VectorMetadata): void;
  query(embedding: Float32Array, topK: number): QueryResult[];
  remove(id: string): void;
  optimize(): void;
  close(): void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate that an ID doesn't contain colons (Zvec rejects them).
 */
function validateId(id: string): void {
  if (id.includes(':')) {
    throw new Error(
      `Invalid vector ID "${id}": colons are not allowed. Use underscores or hyphens instead.`
    );
  }
}

/**
 * Build a Zvec collection schema for the given dimension and collection name.
 * Fields: filePath, chunkIndex, modelId, lineStart, lineEnd.
 */
function buildSchema(name: string, dim: number): InstanceType<typeof ZVecCollectionSchema> {
  return new ZVecCollectionSchema({
    name,
    vectors: {
      name: 'embedding',
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: dim,
      indexParams: {
        indexType: ZVecIndexType.HNSW,
        metricType: ZVecMetricType.COSINE,
        m: 50,
        efConstruction: 500,
      },
    },
    fields: [
      { name: 'filePath', dataType: ZVecDataType.STRING },
      { name: 'chunkIndex', dataType: ZVecDataType.INT32 },
      { name: 'modelId', dataType: ZVecDataType.STRING },
      { name: 'lineStart', dataType: ZVecDataType.INT32 },
      { name: 'lineEnd', dataType: ZVecDataType.INT32 },
    ],
  });
}

/**
 * Open (or create) a Zvec collection at `storageDir/name` with the given dimension.
 * The parent `storageDir` must already exist.
 */
function createCollection(storageDir: string, name: string, dim: number): VectorCollection {
  const collectionPath = path.join(storageDir, name);
  const schema = buildSchema(name, dim);
  const handle = ZVecCreateAndOpen(collectionPath, schema);

  return {
    insert(id: string, embedding: Float32Array, metadata: VectorMetadata): void {
      validateId(id);
      const doc = {
        id,
        vectors: { embedding: Array.from(embedding) },
        fields: {
          filePath: String(metadata['filePath'] ?? ''),
          chunkIndex: Number(metadata['chunkIndex'] ?? 0),
          modelId: String(metadata['modelId'] ?? ''),
          lineStart: Number(metadata['lineStart'] ?? 0),
          lineEnd: Number(metadata['lineEnd'] ?? 0),
        },
      };
      const status = handle.insertSync(doc);
      if (!status.ok) {
        throw new Error(`Zvec insert failed for id="${id}": code=${status.code} ${status.message}`);
      }
    },

    query(embedding: Float32Array, topK: number): QueryResult[] {
      const results = handle.querySync({
        fieldName: 'embedding',
        vector: Array.from(embedding),
        topk: topK,
        outputFields: ['filePath', 'chunkIndex', 'modelId', 'lineStart', 'lineEnd'],
      });

      return results.map((r) => ({
        id: r.id,
        distance: r.score,
        metadata: {
          filePath: r.fields['filePath'] as string,
          chunkIndex: r.fields['chunkIndex'] as number,
          modelId: r.fields['modelId'] as string,
          lineStart: r.fields['lineStart'] as number,
          lineEnd: r.fields['lineEnd'] as number,
        },
      }));
    },

    remove(id: string): void {
      const status = handle.deleteSync(id);
      if (!status.ok) {
        throw new Error(`Zvec delete failed for id="${id}": code=${status.code} ${status.message}`);
      }
    },

    optimize(): void {
      handle.optimizeSync();
    },

    close(): void {
      // Zvec collections are closed/cleaned up when the handle goes out of scope.
      // Call destroySync only if you want to delete the data from disk.
      // For normal close, we do nothing — the GC handles cleanup.
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ProjectCollections {
  /** 768-dim collection for code and text embeddings (jina, nomic) */
  col768: VectorCollection;
  /** 512-dim collection for image embeddings (CLIP) */
  col512: VectorCollection;
  /** Resolved storage path on disk */
  storagePath: string;
}

/**
 * Open both vector collections for a project.
 *
 * Storage layout:
 *   ~/.ez-search/<project>-<hash>/col-768/  (768-dim, code/text)
 *   ~/.ez-search/<project>-<hash>/col-512/  (512-dim, images)
 *
 * Creates the storage directory if it does not exist.
 */
export function openProjectCollections(projectDir: string): ProjectCollections {
  const storageDir = resolveProjectStoragePath(projectDir);
  mkdirSync(storageDir, { recursive: true });

  const col768 = createCollection(storageDir, 'col-768', 768);
  const col512 = createCollection(storageDir, 'col-512', 512);

  return { col768, col512, storagePath: storageDir };
}
