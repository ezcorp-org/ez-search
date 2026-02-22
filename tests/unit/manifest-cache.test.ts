import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir, writeFile } from '../helpers/fixtures.js';
import {
  hashContent,
  hashText,
  makeChunkId,
  loadManifest,
  saveManifest,
  MANIFEST_VERSION,
  MANIFEST_FILENAME,
} from '../../src/services/manifest-cache';

describe('hashContent', () => {
  test('returns a 16-char hex string', () => {
    const result = hashContent(Buffer.from('hello'));
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  test('is deterministic', () => {
    const buf = Buffer.from('deterministic');
    expect(hashContent(buf)).toBe(hashContent(buf));
  });

  test('returns different hashes for different inputs', () => {
    const a = hashContent(Buffer.from('aaa'));
    const b = hashContent(Buffer.from('bbb'));
    expect(a).not.toBe(b);
  });
});

describe('hashText', () => {
  test('returns a 16-char hex string', () => {
    const result = hashText('hello');
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  test('is deterministic', () => {
    expect(hashText('same')).toBe(hashText('same'));
  });

  test('returns different hashes for different inputs', () => {
    expect(hashText('foo')).not.toBe(hashText('bar'));
  });
});

describe('makeChunkId', () => {
  test('format is <12hex>_<4digit>', () => {
    const id = makeChunkId('src/index.ts', 0);
    expect(id).toMatch(/^[0-9a-f]{12}_\d{4}$/);
  });

  test('is deterministic', () => {
    expect(makeChunkId('file.ts', 1)).toBe(makeChunkId('file.ts', 1));
  });

  test('contains no colons', () => {
    const id = makeChunkId('src/file.ts', 5);
    expect(id).not.toContain(':');
  });

  test('differs for different paths', () => {
    expect(makeChunkId('a.ts', 0)).not.toBe(makeChunkId('b.ts', 0));
  });

  test('differs for different indices', () => {
    expect(makeChunkId('a.ts', 0)).not.toBe(makeChunkId('a.ts', 1));
  });
});

describe('loadManifest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('returns empty manifest when file is missing', () => {
    const manifest = loadManifest(tmpDir);
    expect(manifest).toEqual({ version: MANIFEST_VERSION, files: {} });
  });

  test('returns empty manifest for invalid JSON', () => {
    writeFile(tmpDir, path.join('.ez-search', MANIFEST_FILENAME), 'not valid json{{{');
    const manifest = loadManifest(tmpDir);
    expect(manifest).toEqual({ version: MANIFEST_VERSION, files: {} });
  });

  test('returns empty manifest for version mismatch', () => {
    const bad = JSON.stringify({ version: 9999, files: { 'a.ts': {} } });
    writeFile(tmpDir, path.join('.ez-search', MANIFEST_FILENAME), bad);
    const manifest = loadManifest(tmpDir);
    expect(manifest).toEqual({ version: MANIFEST_VERSION, files: {} });
  });

  test('returns parsed manifest for valid file', () => {
    const valid = {
      version: MANIFEST_VERSION,
      files: {
        'src/index.ts': {
          mtime: 1000,
          size: 200,
          hash: 'abc123',
          chunks: [{ id: 'aaa_0000', lineStart: 1, lineEnd: 10, tokenCount: 50, textHash: 'def456' }],
        },
      },
    };
    writeFile(tmpDir, path.join('.ez-search', MANIFEST_FILENAME), JSON.stringify(valid));
    const manifest = loadManifest(tmpDir);
    expect(manifest).toEqual(valid);
  });
});

describe('saveManifest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('writes readable JSON that roundtrips with loadManifest', () => {
    const manifest = {
      version: MANIFEST_VERSION,
      files: {
        'readme.md': {
          mtime: 500,
          size: 100,
          hash: 'deadbeef',
          chunks: [],
        },
      },
    };
    saveManifest(tmpDir, manifest);
    const loaded = loadManifest(tmpDir);
    expect(loaded).toEqual(manifest);
  });
});

