/**
 * Integration tests — clear flag behavior.
 *
 * Verifies that indexing with clear: true wipes the existing index
 * and recreates all chunks from scratch.
 * Gracefully skips when native dependencies are unavailable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDir, cleanupTempDir, writeFile, tryIndex, tryQuery } from '../helpers/fixtures.js';

describe('Clear index flag', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('clear: true resets all chunks (chunksReused === 0)', async () => {
    writeFile(tmpDir, 'a.ts', 'export const a = 1;');
    writeFile(tmpDir, 'b.ts', 'export const b = 2;');
    writeFile(tmpDir, 'c.ts', 'export const c = 3;');

    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;
    expect(first.chunksCreated).toBeGreaterThan(0);

    const cleared = await tryIndex(tmpDir, { type: 'code', clear: true });
    if (cleared === null) return;

    expect(cleared.chunksReused).toBe(0);
    expect(cleared.chunksCreated).toBeGreaterThan(0);
    // Should recreate same number of chunks as initial index
    expect(cleared.chunksCreated).toBe(first.chunksCreated);
  }, 120_000);

  test('clear removes stale data from deleted files', async () => {
    writeFile(tmpDir, 'keep.ts', 'export const keep = true;');
    writeFile(tmpDir, 'remove.ts', 'export const UNIQUE_REMOVE_TOKEN = "gone";');

    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;

    // Delete file but don't re-index yet
    fs.unlinkSync(path.join(tmpDir, 'remove.ts'));

    // Clear and re-index — should only have keep.ts
    const cleared = await tryIndex(tmpDir, { type: 'code', clear: true });
    if (cleared === null) return;

    expect(cleared.filesIndexed).toBe(1);

    // Verify deleted file's content is not findable
    const result = await tryQuery('UNIQUE_REMOVE_TOKEN', {
      projectDir: tmpDir,
      type: 'code',
      mode: 'keyword',
    });
    if (result === null) return;
    expect(result.code.length).toBe(0);
  }, 120_000);

  test('clear rebuilds lexical index from scratch', async () => {
    writeFile(tmpDir, 'old.ts', 'export const OLD_LEXICAL_TOKEN = 1;');
    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;

    // Replace content
    writeFile(tmpDir, 'old.ts', 'export const NEW_LEXICAL_TOKEN = 2;');
    const cleared = await tryIndex(tmpDir, { type: 'code', clear: true });
    if (cleared === null) return;

    // Old token should be gone from lexical index
    const oldResult = await tryQuery('OLD_LEXICAL_TOKEN', {
      projectDir: tmpDir,
      mode: 'keyword',
      type: 'code',
    });
    if (oldResult === null) return;
    expect(oldResult.code.length).toBe(0);

    // New token should be findable
    const newResult = await tryQuery('NEW_LEXICAL_TOKEN', {
      projectDir: tmpDir,
      mode: 'keyword',
      type: 'code',
    });
    if (newResult === null) return;
    expect(newResult.code.length).toBeGreaterThan(0);
  }, 120_000);

  test('normal re-index after clear works incrementally', async () => {
    writeFile(tmpDir, 'a.ts', 'export const a = 1;');

    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;

    // Clear and re-index
    const cleared = await tryIndex(tmpDir, { type: 'code', clear: true });
    if (cleared === null) return;
    expect(cleared.chunksReused).toBe(0);

    // Now re-index without clear — should reuse everything
    const incremental = await tryIndex(tmpDir, { type: 'code' });
    if (incremental === null) return;
    expect(incremental.chunksReused).toBeGreaterThan(0);
    expect(incremental.filesSkipped).toBeGreaterThan(0);
    expect(incremental.filesIndexed).toBe(0);
  }, 120_000);
});
