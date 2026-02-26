import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir, writeFile } from '../helpers/fixtures.js';
import { MANIFEST_VERSION, MANIFEST_FILENAME } from '../../src/services/manifest-cache';

describe('status command corruption detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('manifest >10 bytes but parsed to empty entries sets warning field', async () => {
    const { runStatus } = await import('../../src/cli/commands/status-cmd');

    // Create a manifest with a version mismatch so it parses to empty files,
    // but the file itself is >10 bytes
    const badManifest = JSON.stringify({
      version: MANIFEST_VERSION - 1,
      files: { 'old-file.ts': { mtime: 1, size: 100, hash: 'abc', chunks: [] } },
    });
    expect(badManifest.length).toBeGreaterThan(10);

    // Write manifest to the .ez-search directory
    writeFile(tmpDir, path.join('.ez-search', MANIFEST_FILENAME), badManifest);

    // Also create the storage directory so it doesn't throw CORRUPT_MANIFEST
    fs.mkdirSync(path.join(tmpDir, '.ez-search'), { recursive: true });

    const result = await runStatus({ _silent: true, _projectDir: tmpDir });
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('corrupt');
    expect(result.suggestion).toContain('ez-search index --clear');
  });
});
