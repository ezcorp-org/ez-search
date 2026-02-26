import { describe, test, expect, mock, beforeAll, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir } from '../helpers/fixtures.js';

// ── Mock state ──────────────────────────────────────────────────────────────

/** Track calls to the mock handle methods */
let mockHandle: {
  insertSync: ReturnType<typeof mock>;
  deleteSync: ReturnType<typeof mock>;
  querySync: ReturnType<typeof mock>;
  optimizeSync: ReturnType<typeof mock>;
  closeSync: ReturnType<typeof mock>;
};

function freshMockHandle() {
  return {
    insertSync: mock(() => ({ ok: true })),
    deleteSync: mock(() => ({ ok: true })),
    querySync: mock(() => []),
    optimizeSync: mock(() => {}),
    closeSync: mock(() => {}),
  };
}

let mockZVecCreateAndOpen: ReturnType<typeof mock>;
let mockZVecOpen: ReturnType<typeof mock>;
let mockZVecInitialize: ReturnType<typeof mock>;

function resetMocks() {
  mockHandle = freshMockHandle();
  mockZVecCreateAndOpen = mock(() => mockHandle);
  mockZVecOpen = mock(() => mockHandle);
  mockZVecInitialize = mock(() => {});
}

resetMocks();

// ── Mock @zvec/zvec ─────────────────────────────────────────────────────────
// vector-db.ts uses createRequire to load this CJS module.
// Bun's mock.module intercepts both require() and import().

mock.module('@zvec/zvec', () => ({
  ZVecCreateAndOpen: (...args: unknown[]) => mockZVecCreateAndOpen(...args),
  ZVecOpen: (...args: unknown[]) => mockZVecOpen(...args),
  ZVecCollectionSchema: class MockSchema {
    constructor(public config: unknown) {}
  },
  ZVecDataType: {
    VECTOR_FP32: 'VECTOR_FP32',
    STRING: 'STRING',
    INT32: 'INT32',
  },
  ZVecIndexType: { HNSW: 'HNSW' },
  ZVecMetricType: { COSINE: 'COSINE' },
  ZVecInitialize: (...args: unknown[]) => mockZVecInitialize(...args),
  ZVecLogLevel: { WARN: 'WARN' },
}));

// ── Import module under test after mocks ────────────────────────────────────

let openCollection: typeof import('../../src/services/vector-db').openCollection;
let openProjectCollections: typeof import('../../src/services/vector-db').openProjectCollections;

beforeAll(async () => {
  const mod = await import('../../src/services/vector-db');
  openCollection = mod.openCollection;
  openProjectCollections = mod.openProjectCollections;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('vector-db', () => {
  let tmpDir: string;

  beforeEach(() => {
    resetMocks();
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // ── openCollection ──────────────────────────────────────────────────────

  describe('openCollection', () => {
    test('creates col-768 with 768 dimensions', () => {
      const col = openCollection(tmpDir, 'col-768');
      expect(col).toBeDefined();
      expect(mockZVecCreateAndOpen).toHaveBeenCalledTimes(1);
      const [colPath, schema] = mockZVecCreateAndOpen.mock.calls[0];
      expect(colPath).toContain('col-768');
      expect(schema.config).toMatchObject({ name: 'col-768' });
      // Check 768 dimension in vectors config
      const vectors = (schema.config as any).vectors;
      expect(vectors.dimension).toBe(768);
    });

    test('creates col-512 with 512 dimensions', () => {
      const col = openCollection(tmpDir, 'col-512');
      expect(col).toBeDefined();
      expect(mockZVecCreateAndOpen).toHaveBeenCalledTimes(1);
      const [, schema] = mockZVecCreateAndOpen.mock.calls[0];
      expect((schema.config as any).vectors.dimension).toBe(512);
    });

    test('opens existing collection with ZVecOpen when path exists', () => {
      // Pre-create the collection directory so existsSync returns true
      const storagePath = path.join(tmpDir, '.ez-search');
      fs.mkdirSync(path.join(storagePath, 'col-768'), { recursive: true });

      openCollection(tmpDir, 'col-768');
      expect(mockZVecOpen).toHaveBeenCalledTimes(1);
      expect(mockZVecCreateAndOpen).not.toHaveBeenCalled();
    });

    test('creates storage directory if it does not exist', () => {
      const projectDir = path.join(tmpDir, 'new-project');
      openCollection(projectDir, 'col-768');
      expect(fs.existsSync(path.join(projectDir, '.ez-search'))).toBe(true);
    });

    test('writes schema-version.json', () => {
      openCollection(tmpDir, 'col-768');
      const versionFile = path.join(tmpDir, '.ez-search', 'schema-version.json');
      expect(fs.existsSync(versionFile)).toBe(true);
      const { version } = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      expect(version).toBe(4);
    });
  });

  // ── openProjectCollections ──────────────────────────────────────────────

  describe('openProjectCollections', () => {
    test('returns col768, col512, and storagePath', () => {
      const result = openProjectCollections(tmpDir);
      expect(result.col768).toBeDefined();
      expect(result.col512).toBeDefined();
      expect(result.storagePath).toBe(path.join(path.resolve(tmpDir), '.ez-search'));
    });

    test('creates both collections', () => {
      openProjectCollections(tmpDir);
      // Two collections created
      expect(mockZVecCreateAndOpen).toHaveBeenCalledTimes(2);
      const names = mockZVecCreateAndOpen.mock.calls.map(
        (args: unknown[]) => (args[1] as any).config.name,
      );
      expect(names).toContain('col-768');
      expect(names).toContain('col-512');
    });
  });

  // ── Schema versioning ──────────────────────────────────────────────────

  describe('schema versioning', () => {
    test('wipes collections when schema version differs', () => {
      const storagePath = path.join(tmpDir, '.ez-search');
      fs.mkdirSync(storagePath, { recursive: true });

      // Write old version
      fs.writeFileSync(
        path.join(storagePath, 'schema-version.json'),
        JSON.stringify({ version: 1 }),
      );

      // Create fake collection dirs that should be wiped
      const col768Dir = path.join(storagePath, 'col-768');
      const col512Dir = path.join(storagePath, 'col-512');
      fs.mkdirSync(col768Dir, { recursive: true });
      fs.mkdirSync(col512Dir, { recursive: true });
      fs.writeFileSync(path.join(col768Dir, 'data'), 'old');
      fs.writeFileSync(path.join(col512Dir, 'data'), 'old');

      openCollection(tmpDir, 'col-768');

      // Old dirs should be wiped
      expect(fs.existsSync(path.join(col768Dir, 'data'))).toBe(false);
      expect(fs.existsSync(col512Dir)).toBe(false);

      // Version file updated
      const { version } = JSON.parse(
        fs.readFileSync(path.join(storagePath, 'schema-version.json'), 'utf8'),
      );
      expect(version).toBe(4);
    });

    test('does not wipe when schema version matches', () => {
      const storagePath = path.join(tmpDir, '.ez-search');
      fs.mkdirSync(storagePath, { recursive: true });

      // Write current version
      fs.writeFileSync(
        path.join(storagePath, 'schema-version.json'),
        JSON.stringify({ version: 4 }),
      );

      // Create collection dirs — they should survive
      const col768Dir = path.join(storagePath, 'col-768');
      fs.mkdirSync(col768Dir, { recursive: true });
      fs.writeFileSync(path.join(col768Dir, 'marker'), 'keep');

      openCollection(tmpDir, 'col-768');

      // marker file should still exist since col-768 dir was opened (not wiped)
      // Note: ZVecOpen is called because the dir exists
      expect(mockZVecOpen).toHaveBeenCalledTimes(1);
    });

    test('wipes on corrupt version file', () => {
      const storagePath = path.join(tmpDir, '.ez-search');
      fs.mkdirSync(storagePath, { recursive: true });

      fs.writeFileSync(
        path.join(storagePath, 'schema-version.json'),
        'not-valid-json!!!',
      );

      // Create dirs that should be wiped
      const col768Dir = path.join(storagePath, 'col-768');
      fs.mkdirSync(col768Dir, { recursive: true });
      fs.writeFileSync(path.join(col768Dir, 'data'), 'stale');

      openCollection(tmpDir, 'col-768');

      expect(fs.existsSync(path.join(col768Dir, 'data'))).toBe(false);
    });
  });

  // ── insert ─────────────────────────────────────────────────────────────

  describe('insert', () => {
    test('inserts a document with correct structure', () => {
      const col = openCollection(tmpDir, 'col-768');
      const embedding = new Float32Array(768).fill(0.1);
      const metadata = {
        filePath: 'src/index.ts',
        chunkIndex: 0,
        modelId: 'qwen3',
        lineStart: 1,
        lineEnd: 10,
        chunkText: 'hello world',
      };

      col.insert('test_id', embedding, metadata);

      expect(mockHandle.insertSync).toHaveBeenCalledTimes(1);
      const doc = mockHandle.insertSync.mock.calls[0][0];
      expect(doc.id).toBe('test_id');
      expect(doc.vectors.embedding).toEqual(Array.from(embedding));
      expect(doc.fields.filePath).toBe('src/index.ts');
      expect(doc.fields.chunkIndex).toBe(0);
      expect(doc.fields.modelId).toBe('qwen3');
      expect(doc.fields.lineStart).toBe(1);
      expect(doc.fields.lineEnd).toBe(10);
      expect(doc.fields.chunkText).toBe('hello world');
    });

    test('rejects IDs containing colons', () => {
      const col = openCollection(tmpDir, 'col-768');
      const embedding = new Float32Array(768);

      expect(() => col.insert('bad:id', embedding, {})).toThrow(
        /colons are not allowed/,
      );
      expect(mockHandle.insertSync).not.toHaveBeenCalled();
    });

    test('handles duplicate ID by deleting and reinserting', () => {
      mockHandle.insertSync = mock()
        .mockImplementationOnce(() => ({ ok: false, code: 'ZVEC_ALREADY_EXISTS' }))
        .mockImplementationOnce(() => ({ ok: true }));

      const col = openCollection(tmpDir, 'col-768');
      const embedding = new Float32Array(768);

      col.insert('dup_id', embedding, {});

      expect(mockHandle.deleteSync).toHaveBeenCalledWith('dup_id');
      expect(mockHandle.insertSync).toHaveBeenCalledTimes(2);
    });

    test('throws on non-duplicate insert failure', () => {
      mockHandle.insertSync = mock(() => ({
        ok: false,
        code: 'ZVEC_INTERNAL',
        message: 'disk full',
      }));

      const col = openCollection(tmpDir, 'col-768');
      const embedding = new Float32Array(768);

      expect(() => col.insert('some_id', embedding, {})).toThrow(
        /Zvec insert failed.*ZVEC_INTERNAL/,
      );
    });

    test('throws if retry after duplicate also fails', () => {
      mockHandle.insertSync = mock(() => ({
        ok: false,
        code: 'ZVEC_ALREADY_EXISTS',
        message: 'still exists',
      }));

      const col = openCollection(tmpDir, 'col-768');
      const embedding = new Float32Array(768);

      // First call returns ALREADY_EXISTS, triggers delete, second also returns ALREADY_EXISTS
      expect(() => col.insert('stuck_id', embedding, {})).toThrow(
        /Zvec insert failed/,
      );
    });

    test('coerces missing metadata fields to defaults', () => {
      const col = openCollection(tmpDir, 'col-768');
      col.insert('no_meta', new Float32Array(768), {});

      const doc = mockHandle.insertSync.mock.calls[0][0];
      expect(doc.fields.filePath).toBe('');
      expect(doc.fields.chunkIndex).toBe(0);
      expect(doc.fields.modelId).toBe('');
      expect(doc.fields.lineStart).toBe(0);
      expect(doc.fields.lineEnd).toBe(0);
      expect(doc.fields.chunkText).toBe('');
    });
  });

  // ── query ──────────────────────────────────────────────────────────────

  describe('query', () => {
    test('returns normalized QueryResult array', () => {
      mockHandle.querySync = mock(() => [
        {
          id: 'result_1',
          score: 0.85,
          fields: {
            filePath: 'src/main.ts',
            chunkIndex: 2,
            modelId: 'qwen3',
            lineStart: 10,
            lineEnd: 20,
            chunkText: 'function main()',
          },
        },
      ]);

      const col = openCollection(tmpDir, 'col-768');
      const embedding = new Float32Array(768).fill(0.5);
      const results = col.query(embedding, 5);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'result_1',
        distance: 0.85,
        metadata: {
          filePath: 'src/main.ts',
          chunkIndex: 2,
          modelId: 'qwen3',
          lineStart: 10,
          lineEnd: 20,
          chunkText: 'function main()',
        },
      });
    });

    test('passes correct query params without filter', () => {
      const col = openCollection(tmpDir, 'col-768');
      const embedding = new Float32Array(768).fill(0.1);
      col.query(embedding, 10);

      const queryArg = mockHandle.querySync.mock.calls[0][0];
      expect(queryArg.fieldName).toBe('embedding');
      expect(queryArg.vector).toEqual(Array.from(embedding));
      expect(queryArg.topk).toBe(10);
      expect(queryArg.outputFields).toEqual([
        'filePath', 'chunkIndex', 'modelId', 'lineStart', 'lineEnd', 'chunkText',
      ]);
      expect(queryArg.filter).toBeUndefined();
    });

    test('passes filter when provided', () => {
      const col = openCollection(tmpDir, 'col-768');
      const embedding = new Float32Array(768);
      col.query(embedding, 5, 'filePath == "src/index.ts"');

      const queryArg = mockHandle.querySync.mock.calls[0][0];
      expect(queryArg.filter).toBe('filePath == "src/index.ts"');
    });

    test('returns empty array when no results', () => {
      mockHandle.querySync = mock(() => []);

      const col = openCollection(tmpDir, 'col-768');
      const results = col.query(new Float32Array(768), 5);
      expect(results).toEqual([]);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────

  describe('remove', () => {
    test('calls deleteSync with the given ID', () => {
      const col = openCollection(tmpDir, 'col-768');
      col.remove('some_id');

      expect(mockHandle.deleteSync).toHaveBeenCalledWith('some_id');
    });

    test('throws on delete failure', () => {
      mockHandle.deleteSync = mock(() => ({
        ok: false,
        code: 'ZVEC_NOT_FOUND',
        message: 'not found',
      }));

      const col = openCollection(tmpDir, 'col-768');
      expect(() => col.remove('missing_id')).toThrow(
        /Zvec delete failed.*ZVEC_NOT_FOUND/,
      );
    });
  });

  // ── optimize ───────────────────────────────────────────────────────────

  describe('optimize', () => {
    test('calls optimizeSync on the handle', () => {
      const col = openCollection(tmpDir, 'col-768');
      col.optimize();
      expect(mockHandle.optimizeSync).toHaveBeenCalledTimes(1);
    });
  });

  // ── close ──────────────────────────────────────────────────────────────

  describe('close', () => {
    test('calls closeSync on the handle', () => {
      const col = openCollection(tmpDir, 'col-768');
      col.close();
      expect(mockHandle.closeSync).toHaveBeenCalledTimes(1);
    });
  });
});
