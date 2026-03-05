/**
 * Vector DB service — wraps @zvec/zvec behind a clean interface.
 *
 * Uses createRequire because @zvec/zvec is a CommonJS package in an ESM project.
 * Two collections per project:
 *   col-768 — Qwen3 code+text embeddings (768-dim)
 *   col-512 — CLIP image embeddings (512-dim)
 *
 * Storage lives at <project>/.ez-search/ (project-scoped).
 */

import { createRequire } from 'module';
import { mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';
import { resolveProjectStoragePath } from '../config/paths.js';

const require = createRequire(import.meta.url);

const {
  ZVecCreateAndOpen,
  ZVecOpen,
  ZVecCollectionSchema,
  ZVecDataType,
  ZVecIndexType,
  ZVecMetricType,
  ZVecInitialize,
  ZVecLogLevel,
} = require('@zvec/zvec') as typeof import('@zvec/zvec');

// Initialize Zvec at module level — suppress noisy logs
ZVecInitialize({ logLevel: ZVecLogLevel.WARN });

// ── Schema versioning ─────────────────────────────────────────────────────────

const SCHEMA_VERSION = 4;

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
  query(embedding: Float32Array, topK: number, filter?: string): QueryResult[];
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
      { name: 'chunkText', dataType: ZVecDataType.STRING },
    ],
  });
}

/**
 * Check the schema version sidecar file. If the version has changed, wipe stale
 * collections so they are recreated with the new schema on next open.
 */
function ensureSchemaVersion(storageDir: string): void {
  const versionFile = path.join(storageDir, 'schema-version.json');
  if (existsSync(versionFile)) {
    try {
      const { version } = JSON.parse(readFileSync(versionFile, 'utf8')) as { version: number };
      if (version !== SCHEMA_VERSION) {
        rmSync(path.join(storageDir, 'col-768'), { recursive: true, force: true });
        rmSync(path.join(storageDir, 'col-512'), { recursive: true, force: true });
      }
    } catch {
      // Corrupt version file — wipe and continue
      rmSync(path.join(storageDir, 'col-768'), { recursive: true, force: true });
      rmSync(path.join(storageDir, 'col-512'), { recursive: true, force: true });
    }
  }
  writeFileSync(versionFile, JSON.stringify({ version: SCHEMA_VERSION }));
}

/**
 * Open (or create) a Zvec collection at `storageDir/name` with the given dimension.
 * The parent `storageDir` must already exist.
 */
function createCollection(storageDir: string, name: string, dim: number): VectorCollection {
  const collectionPath = path.join(storageDir, name);
  const handle = existsSync(collectionPath)
    ? ZVecOpen(collectionPath)
    : ZVecCreateAndOpen(collectionPath, buildSchema(name, dim));

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
          chunkText: String(metadata['chunkText'] ?? ''),
        },
      };
      let status = handle.insertSync(doc);
      if (!status.ok && status.code === 'ZVEC_ALREADY_EXISTS') {
        handle.deleteSync(id);
        status = handle.insertSync(doc);
      }
      if (!status.ok) {
        throw new Error(`Zvec insert failed for id="${id}": code=${status.code} ${status.message}`);
      }
    },

    query(embedding: Float32Array, topK: number, filter?: string): QueryResult[] {
      const results = handle.querySync({
        fieldName: 'embedding',
        vector: Array.from(embedding),
        topk: topK,
        outputFields: ['filePath', 'chunkIndex', 'modelId', 'lineStart', 'lineEnd', 'chunkText'],
        ...(filter ? { filter } : {}),
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
          chunkText: r.fields['chunkText'] as string,
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
      handle.closeSync();
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ProjectCollections {
  /** 768-dim collection for code+text embeddings (Qwen3) */
  col768: VectorCollection;
  /** 512-dim collection for image embeddings (CLIP) */
  col512: VectorCollection;
  /** Resolved storage path on disk */
  storagePath: string;
}

export function openProjectCollections(projectDir: string): ProjectCollections {
  const storageDir = resolveProjectStoragePath(projectDir);
  mkdirSync(storageDir, { recursive: true });
  ensureSchemaVersion(storageDir);

  try {
    const col768 = createCollection(storageDir, 'col-768', 768);
    const col512 = createCollection(storageDir, 'col-512', 512);
    return { col768, col512, storagePath: storageDir };
  } catch {
    // Stale LOCK files from a crashed process can block ZVecOpen.
    // Wipe the entire storage dir (collections + manifest) and recreate
    // from scratch so the vector store and manifest stay in sync.
    rmSync(storageDir, { recursive: true, force: true });
    mkdirSync(storageDir, { recursive: true });
    ensureSchemaVersion(storageDir);

    const col768 = createCollection(storageDir, 'col-768', 768);
    const col512 = createCollection(storageDir, 'col-512', 512);
    return { col768, col512, storagePath: storageDir };
  }
}

export function openCollection(projectDir: string, name: 'col-768' | 'col-512'): VectorCollection {
  const storageDir = resolveProjectStoragePath(projectDir);
  mkdirSync(storageDir, { recursive: true });
  ensureSchemaVersion(storageDir);

  const dim = name === 'col-768' ? 768 : 512;
  return createCollection(storageDir, name, dim);
}
