/**
 * Integration tests for the text-to-image query pipeline.
 *
 * Mocks native deps (sharp, onnxruntime-node, @huggingface/transformers, @zvec/zvec)
 * so the full query pipeline runs without real model weights or native vector DB.
 * Seeds an in-memory mock vector collection with known image embeddings and a real
 * manifest, then runs the query command and verifies output formatting.
 */

import { describe, test, expect, mock, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir } from '../helpers/fixtures.js';

// ── Mock native deps ─────────────────────────────────────────────────────────
mock.module('onnxruntime-node', () => ({
  default: {},
  InferenceSession: {},
  Tensor: {},
}));
mock.module('sharp', () => {
  const fn = () => fn;
  return { default: Object.assign(fn, { cache: fn, concurrency: fn, counters: fn, simd: fn, versions: fn }) };
});

const IMAGE_FILES = [
  { path: 'cat-photo.jpg', seed: 10 },
  { path: 'dog-photo.png', seed: 50 },
  { path: 'sunset.webp', seed: 100 },
];

/**
 * Generate a deterministic 512-dim unit vector pointing mostly in dimension `seed`.
 */
function makeFakeEmbedding(seed: number): Float32Array {
  const emb = new Float32Array(512);
  for (let i = 0; i < 512; i++) emb[i] = 0.01;
  emb[seed % 512] = 1.0;
  let norm = 0;
  for (let i = 0; i < 512; i++) norm += emb[i] * emb[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < 512; i++) emb[i] /= norm;
  return emb;
}

/** Cosine distance between two vectors (0 = identical, 2 = opposite). */
function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return 1 - sim; // cosine distance
}

// ── In-memory vector store used by mock openCollection ────────────────────────

type StoredEntry = { id: string; embedding: Float32Array; metadata: Record<string, string | number> };
const collectionStores = new Map<string, StoredEntry[]>();

function getMockCollection(name: string) {
  if (!collectionStores.has(name)) collectionStores.set(name, []);
  const store = collectionStores.get(name)!;

  return {
    insert(id: string, embedding: Float32Array, metadata: Record<string, string | number>) {
      store.push({ id, embedding, metadata });
    },
    query(embedding: Float32Array, topK: number) {
      return store
        .map(entry => ({ id: entry.id, distance: cosineDistance(embedding, entry.embedding), metadata: entry.metadata }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, topK);
    },
    remove(id: string) {
      const idx = store.findIndex(e => e.id === id);
      if (idx >= 0) store.splice(idx, 1);
    },
    optimize() {},
    close() {},
  };
}

// Mock @zvec/zvec so vector-db.ts module can load
mock.module('@zvec/zvec', () => ({
  ZVecCreateAndOpen: () => ({}),
  ZVecOpen: () => ({}),
  ZVecCollectionSchema: class { constructor() {} },
  ZVecDataType: { VECTOR_FP32: 0, STRING: 1, INT32: 2 },
  ZVecIndexType: { HNSW: 0 },
  ZVecMetricType: { COSINE: 0 },
  ZVecInitialize: () => {},
  ZVecLogLevel: { WARN: 0 },
}));

// Mock vector-db to use our in-memory store
mock.module('../../src/services/vector-db.js', () => ({
  openCollection: (_projectDir: string, name: string) => getMockCollection(name),
  openProjectCollections: (projectDir: string) => ({
    col768: getMockCollection('col-768'),
    col512: getMockCollection('col-512'),
    storagePath: path.join(projectDir, '.ez-search'),
  }),
}));

/**
 * Mock text model returns the same embedding as makeFakeEmbedding(10) — this
 * overlaps with cat-photo.jpg's vector, ensuring the query returns results
 * with meaningful (high) scores.
 */
mock.module('@huggingface/transformers', () => ({
  env: { cacheDir: '', allowRemoteModels: false },
  // model-router.ts imports `pipeline` for code/text embeddings
  pipeline: async () => {
    const fn = async (texts: string[]) => ({ data: new Float32Array(texts.length * 768) });
    fn.dispose = async () => {};
    return fn;
  },
  AutoTokenizer: {
    from_pretrained: async () => {
      const tokenize = (texts: string | string[], _opts?: unknown) => {
        const arr = Array.isArray(texts) ? texts : [texts];
        return {
          input_ids: { data: BigInt64Array.from([1n]), dims: [arr.length, 1] },
          attention_mask: { data: BigInt64Array.from([1n]), dims: [arr.length, 1] },
        };
      };
      return tokenize;
    },
  },
  CLIPTextModelWithProjection: {
    from_pretrained: async () => {
      // All queries return the cat-photo embedding for predictable overlap
      return (inputs: { input_ids: { data: BigInt64Array; dims: number[] } }) => {
        const batchSize = inputs.input_ids.dims[0];
        const allData = new Float32Array(batchSize * 512);
        for (let b = 0; b < batchSize; b++) {
          allData.set(makeFakeEmbedding(10), b * 512);
        }
        return { text_embeds: { data: allData } };
      };
    },
  },
  CLIPVisionModelWithProjection: { from_pretrained: async () => ({}) },
  AutoProcessor: { from_pretrained: async () => ({}) },
  RawImage: { fromBlob: async () => ({}) },
}));

let tmpDir: string;

/**
 * Run runQuery while capturing stdout and suppressing stderr.
 */
async function captureQuery(
  queryText: string,
  options: Parameters<typeof import('../../src/cli/commands/query-cmd.js').runQuery>[1],
): Promise<string[]> {
  const logs: string[] = [];
  const origLog = console.log;
  const origStderrWrite = process.stderr.write;
  const origCwd = process.cwd();

  console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  process.stderr.write = (() => true) as typeof process.stderr.write;

  try {
    process.chdir(tmpDir);
    const { runQuery } = await import('../../src/cli/commands/query-cmd.js');
    await runQuery(queryText, options);
  } finally {
    process.chdir(origCwd);
    console.log = origLog;
    process.stderr.write = origStderrWrite;
  }
  return logs;
}

describe('text-to-image query', () => {
  beforeAll(async () => {
    tmpDir = createTempDir();
    const storagePath = path.join(tmpDir, '.ez-search');
    fs.mkdirSync(storagePath, { recursive: true });

    // Schema version
    fs.writeFileSync(path.join(storagePath, 'schema-version.json'), JSON.stringify({ version: 2 }));

    // Dummy image files (scanner needs them to detect image type)
    for (const img of IMAGE_FILES) {
      fs.writeFileSync(path.join(tmpDir, img.path), 'fake-data');
    }

    // Seed mock col-512 with fake image embeddings
    const { makeChunkId, saveManifest, MANIFEST_VERSION } = await import('../../src/services/manifest-cache.js');

    const col512 = getMockCollection('col-512');
    for (const img of IMAGE_FILES) {
      col512.insert(makeChunkId(img.path, 0), makeFakeEmbedding(img.seed), {
        filePath: img.path,
        chunkIndex: 0,
        modelId: 'Xenova/clip-vit-base-patch32',
        lineStart: 0,
        lineEnd: 0,
        chunkText: '',
      });
    }

    // Write manifest with image entries
    const files: Record<string, { mtime: number; size: number; hash: string; chunks: { id: string; lineStart: number; lineEnd: number; tokenCount: number; textHash: string }[] }> = {};
    for (const img of IMAGE_FILES) {
      files[img.path] = {
        mtime: Date.now(),
        size: 100,
        hash: 'fakehash' + img.seed,
        chunks: [{ id: makeChunkId(img.path, 0), lineStart: 0, lineEnd: 0, tokenCount: 0, textHash: '' }],
      };
    }
    saveManifest(tmpDir, { version: MANIFEST_VERSION, files });
  });

  afterAll(() => {
    if (tmpDir) cleanupTempDir(tmpDir);
    collectionStores.clear();
  });

  test('JSON output has image array with file + score for all 3 seeded images', async () => {
    const logs = await captureQuery('a photograph', { format: 'json', topK: '5', type: 'image', autoIndex: false });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const output = JSON.parse(logs[0]);

    expect(output.image).toBeDefined();
    expect(output.image.length).toBe(3);

    for (const result of output.image) {
      expect(typeof result.file).toBe('string');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }

    const files = output.image.map((r: { file: string }) => r.file).sort();
    expect(files).toContain('cat-photo.jpg');
    expect(files).toContain('dog-photo.png');
    expect(files).toContain('sunset.webp');
  }, 30_000);

  test('text output has ## Images header with Relevance: lines', async () => {
    const logs = await captureQuery('scenic landscape', { format: 'text', topK: '5', type: 'image', autoIndex: false });

    const allOutput = logs.join('\n');
    expect(allOutput).toContain('## Images');
    expect(allOutput).toContain('Relevance:');

    const hasImageFile = allOutput.includes('cat-photo.jpg') ||
      allOutput.includes('dog-photo.png') ||
      allOutput.includes('sunset.webp');
    expect(hasImageFile).toBe(true);
  }, 30_000);

  test('--type code excludes image results', async () => {
    const logs = await captureQuery('cat', { format: 'json', topK: '5', type: 'code', autoIndex: false });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const output = JSON.parse(logs[0]);
    expect(output.image).toBeUndefined();
  }, 30_000);

  test('--threshold 0.99 filters low-score results', async () => {
    const logs = await captureQuery('test query', { format: 'json', topK: '10', type: 'image', threshold: '0.99', autoIndex: false });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const output = JSON.parse(logs[0]);

    // cat-photo.jpg has score ~1.0 (same vector as query), others should be filtered
    if (output.image) {
      for (const r of output.image) {
        expect(r.score).toBeGreaterThanOrEqual(0.99);
      }
      // Only the cat-photo should pass — it's the exact same vector
      expect(output.image.length).toBeLessThanOrEqual(1);
    }
  }, 30_000);

  test('auto-detection (no --type) finds images from image-only manifest', async () => {
    const logs = await captureQuery('nature photography', { format: 'json', topK: '5', autoIndex: false });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const output = JSON.parse(logs[0]);

    // Auto-detection should find images (manifest only has image files)
    expect(output.image).toBeDefined();
    expect(output.image.length).toBeGreaterThanOrEqual(1);

    // No code/text results (none indexed)
    expect(output.code).toBeUndefined();
    expect(output.text).toBeUndefined();
  }, 30_000);
});
