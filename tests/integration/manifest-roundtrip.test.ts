import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadManifest,
  saveManifest,
  MANIFEST_VERSION,
  MANIFEST_FILENAME,
  type Manifest,
} from '../../src/services/manifest-cache.js';
import { createTempDir, cleanupTempDir } from '../helpers/fixtures.js';

describe('manifest roundtrip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('save then load preserves all fields of a complex manifest', () => {
    const manifest: Manifest = {
      version: MANIFEST_VERSION,
      files: {
        'src/index.ts': {
          mtime: 1700000000000,
          size: 1234,
          hash: 'abc123def456gh',
          chunks: [
            {
              id: 'a3f9c2d14b7e_0000',
              lineStart: 1,
              lineEnd: 50,
              tokenCount: 200,
              textHash: 'chunk0hash123456',
            },
            {
              id: 'a3f9c2d14b7e_0001',
              lineStart: 51,
              lineEnd: 100,
              tokenCount: 180,
              textHash: 'chunk1hash789012',
            },
          ],
        },
        'lib/utils.js': {
          mtime: 1700000001000,
          size: 567,
          hash: '99887766aabbcc',
          chunks: [
            {
              id: 'b4e8d3c25a6f_0000',
              lineStart: 1,
              lineEnd: 30,
              tokenCount: 120,
              textHash: 'utilchunkhash00',
            },
          ],
        },
      },
    };

    saveManifest(tmpDir, manifest);
    const loaded = loadManifest(tmpDir);

    expect(loaded).toEqual(manifest);
  });

  test('version mismatch returns empty manifest with current version', () => {
    const wrongVersion = { version: 99, files: { 'a.ts': { mtime: 1, size: 2, hash: 'x', chunks: [] } } };
    const filePath = path.join(tmpDir, MANIFEST_FILENAME);
    fs.writeFileSync(filePath, JSON.stringify(wrongVersion));

    const loaded = loadManifest(tmpDir);

    expect(loaded).toEqual({ version: MANIFEST_VERSION, files: {} });
  });

  test('corrupt JSON returns empty manifest with current version', () => {
    const filePath = path.join(tmpDir, MANIFEST_FILENAME);
    fs.writeFileSync(filePath, '{{not valid json!!!');

    const loaded = loadManifest(tmpDir);

    expect(loaded).toEqual({ version: MANIFEST_VERSION, files: {} });
  });
});
