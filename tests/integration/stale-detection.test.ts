/**
 * Integration tests — stale index detection.
 *
 * Verifies that after modifying files on disk without re-indexing,
 * queries and status correctly report staleness.
 * Gracefully skips when native dependencies are unavailable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDir, cleanupTempDir, writeFile, tryIndex, tryQuery } from '../helpers/fixtures.js';

describe('Stale index detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('modified file on disk: query reports stale', async () => {
    writeFile(tmpDir, 'config.ts', 'export const timeout = 5000;');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    // Modify file content after indexing
    // Use a delay to ensure mtime changes
    const filePath = path.join(tmpDir, 'config.ts');
    const stat = fs.statSync(filePath);
    fs.writeFileSync(filePath, 'export const timeout = 9999; // changed');
    // Force mtime to be different (future)
    fs.utimesSync(filePath, new Date(stat.atimeMs + 2000), new Date(stat.mtimeMs + 2000));

    const result = await tryQuery('timeout', { projectDir: tmpDir, type: 'code' });
    if (result === null) return;

    expect(result.stale).toBe(true);
    expect(result.staleFileCount).toBeGreaterThan(0);
  }, 120_000);

  test('status reports stale after file modification', async () => {
    writeFile(tmpDir, 'data.ts', 'export const value = "original";');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    // Modify the file
    const filePath = path.join(tmpDir, 'data.ts');
    const stat = fs.statSync(filePath);
    fs.writeFileSync(filePath, 'export const value = "modified";');
    fs.utimesSync(filePath, new Date(stat.atimeMs + 2000), new Date(stat.mtimeMs + 2000));

    const { status } = await import('../../src/index.js');
    const result = await status({ projectDir: tmpDir });

    expect(result.staleFileCount).toBeGreaterThanOrEqual(1);
  }, 120_000);

  test('adding a new file without re-indexing: stale detected', async () => {
    writeFile(tmpDir, 'existing.ts', 'export const x = 1;');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    // Add a new file without re-indexing
    writeFile(tmpDir, 'new-file.ts', 'export const y = 2;');

    const { status } = await import('../../src/index.js');
    const result = await status({ projectDir: tmpDir });

    expect(result.staleFileCount).toBeGreaterThanOrEqual(1);
  }, 120_000);

  test('re-indexing resolves staleness', async () => {
    writeFile(tmpDir, 'app.ts', 'export const mode = "dev";');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    // Make it stale
    const filePath = path.join(tmpDir, 'app.ts');
    const stat = fs.statSync(filePath);
    fs.writeFileSync(filePath, 'export const mode = "prod";');
    fs.utimesSync(filePath, new Date(stat.atimeMs + 2000), new Date(stat.mtimeMs + 2000));

    const { status } = await import('../../src/index.js');
    const staleResult = await status({ projectDir: tmpDir });
    expect(staleResult.staleFileCount).toBeGreaterThanOrEqual(1);

    // Re-index to resolve staleness
    await tryIndex(tmpDir, { type: 'code' });
    const freshResult = await status({ projectDir: tmpDir });
    expect(freshResult.staleFileCount).toBe(0);
  }, 120_000);

  test('deleting a file without re-indexing: stale detected', async () => {
    writeFile(tmpDir, 'keep.ts', 'export const keep = true;');
    writeFile(tmpDir, 'delete-me.ts', 'export const deleteMe = true;');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    // Delete without re-indexing
    fs.unlinkSync(path.join(tmpDir, 'delete-me.ts'));

    const { status } = await import('../../src/index.js');
    const result = await status({ projectDir: tmpDir });

    expect(result.staleFileCount).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
