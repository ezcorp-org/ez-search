import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDir, cleanupTempDir, writeFile } from '../helpers/fixtures.js';
import { loadManifest } from '../../src/services/manifest-cache';

describe('calcStaleness', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('returns 0 for empty manifest and empty directory', async () => {
    const { calcStaleness } = await import('../../src/services/staleness');
    const manifest = loadManifest(tmpDir);
    const result = await calcStaleness(tmpDir, manifest, true);
    expect(result).toBe(0);
  });

  test('detects new file not in manifest', async () => {
    const { calcStaleness } = await import('../../src/services/staleness');
    writeFile(tmpDir, 'hello.ts', 'console.log("hi")');
    const manifest = loadManifest(tmpDir);
    const result = await calcStaleness(tmpDir, manifest, true);
    expect(result).toBe(1);
  });

  test('detects modified file with changed mtime', async () => {
    const { calcStaleness } = await import('../../src/services/staleness');
    writeFile(tmpDir, 'hello.ts', 'console.log("hi")');
    const manifest = loadManifest(tmpDir);
    // Add entry with old mtime so it appears modified
    manifest.files['hello.ts'] = {
      mtime: 1,
      size: 10,
      hash: 'abc123',
      chunks: [],
    };
    const result = await calcStaleness(tmpDir, manifest, true);
    expect(result).toBe(1);
  });

  test('detects deleted file in manifest but not on disk', async () => {
    const { calcStaleness } = await import('../../src/services/staleness');
    const manifest = loadManifest(tmpDir);
    manifest.files['gone.ts'] = {
      mtime: Date.now(),
      size: 10,
      hash: 'abc123',
      chunks: [],
    };
    const result = await calcStaleness(tmpDir, manifest, true);
    expect(result).toBe(1);
  });
});
