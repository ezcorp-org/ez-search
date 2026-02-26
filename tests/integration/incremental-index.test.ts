/**
 * Integration tests — incremental re-indexing behavior.
 *
 * Verifies that the index pipeline correctly detects changed, deleted,
 * and new files, only processing what's necessary.
 * Gracefully skips when native dependencies are unavailable.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDir, cleanupTempDir, writeFile, tryIndex } from '../helpers/fixtures.js';

describe('Incremental re-indexing', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('modify one file: only changed chunks updated', async () => {
    writeFile(tmpDir, 'a.ts', 'export const a = 1;');
    writeFile(tmpDir, 'b.ts', 'export const b = 2;');
    writeFile(tmpDir, 'c.ts', 'export const c = 3;');

    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;
    expect(first.status).toBe('ok');
    expect(first.filesIndexed).toBe(3);

    // Modify only one file
    writeFile(tmpDir, 'b.ts', 'export const b = 999; // modified');

    const second = await tryIndex(tmpDir, { type: 'code' });
    if (second === null) return;

    expect(second.filesIndexed).toBe(1);
    expect(second.filesSkipped).toBe(2);
    expect(second.chunksCreated).toBeGreaterThan(0);
    expect(second.chunksCreated).toBeLessThan(first.chunksCreated);
    expect(second.chunksReused).toBeGreaterThan(0);
  }, 120_000);

  test('delete one file: chunks removed', async () => {
    writeFile(tmpDir, 'a.ts', 'export const a = 1;');
    writeFile(tmpDir, 'b.ts', 'export const b = 2;');
    writeFile(tmpDir, 'c.ts', 'export const c = 3;');

    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;
    expect(first.filesIndexed).toBe(3);

    // Delete one file
    const fs = await import('fs');
    const path = await import('path');
    fs.unlinkSync(path.join(tmpDir, 'b.ts'));

    const second = await tryIndex(tmpDir, { type: 'code' });
    if (second === null) return;

    expect(second.chunksRemoved).toBeGreaterThan(0);
    expect(second.filesSkipped).toBe(2);
    expect(second.filesIndexed).toBe(0);
  }, 120_000);

  test('add a new file: new chunks created, existing reused', async () => {
    writeFile(tmpDir, 'a.ts', 'export const a = 1;');
    writeFile(tmpDir, 'b.ts', 'export const b = 2;');

    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;
    expect(first.filesIndexed).toBe(2);

    // Add a new file
    writeFile(tmpDir, 'c.ts', 'export const c = 3;');

    const second = await tryIndex(tmpDir, { type: 'code' });
    if (second === null) return;

    expect(second.filesIndexed).toBe(1);
    expect(second.filesSkipped).toBe(2);
    expect(second.chunksCreated).toBeGreaterThan(0);
    expect(second.chunksReused).toBeGreaterThan(0);
  }, 120_000);

  test('unchanged files: all chunks reused, nothing new', async () => {
    writeFile(tmpDir, 'a.ts', 'export const a = 1;');
    writeFile(tmpDir, 'b.ts', 'export const b = 2;');
    writeFile(tmpDir, 'c.ts', 'export const c = 3;');

    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;

    const second = await tryIndex(tmpDir, { type: 'code' });
    if (second === null) return;

    expect(second.filesIndexed).toBe(0);
    expect(second.filesSkipped).toBe(3);
    expect(second.chunksCreated).toBe(0);
    expect(second.chunksRemoved).toBe(0);
    expect(second.chunksReused).toBe(first.chunksCreated);
  }, 120_000);

  test('file count updates correctly across incremental operations', async () => {
    const { status } = await import('../../src/index.js');

    writeFile(tmpDir, 'a.ts', 'export const a = 1;');
    writeFile(tmpDir, 'b.ts', 'export const b = 2;');

    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;
    const status1 = await status({ projectDir: tmpDir });
    expect(status1.fileCount).toBe(2);

    // Add file
    writeFile(tmpDir, 'c.ts', 'export const c = 3;');
    await tryIndex(tmpDir, { type: 'code' });
    const status2 = await status({ projectDir: tmpDir });
    expect(status2.fileCount).toBe(3);

    // Delete file
    const fs = await import('fs');
    const path = await import('path');
    fs.unlinkSync(path.join(tmpDir, 'a.ts'));
    await tryIndex(tmpDir, { type: 'code' });
    const status3 = await status({ projectDir: tmpDir });
    expect(status3.fileCount).toBe(2);
  }, 180_000);
});
