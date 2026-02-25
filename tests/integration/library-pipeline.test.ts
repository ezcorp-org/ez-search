/**
 * Integration tests — multi-step library API workflows.
 *
 * Tests index() → query() → status() pipelines using real embeddings.
 * Gracefully skips when zvec is unavailable.
 */

import * as fs from 'fs';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDir, cleanupTempDir, writeFile, tryIndex, tryQuery } from '../helpers/fixtures.js';

describe('Library pipeline integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('full pipeline: index → query → status all succeed', async () => {
    writeFile(tmpDir, 'hello.ts', 'export function greet() { return "hello world"; }');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;
    expect(indexResult.status).toBe('ok');
    expect(indexResult.filesIndexed).toBeGreaterThanOrEqual(1);

    const queryResult = await tryQuery('greet', { projectDir: tmpDir });
    if (queryResult === null) return;
    expect(queryResult.query).toBe('greet');
    expect(Array.isArray(queryResult.code)).toBe(true);

    const { status } = await import('../../src/index.js');
    const statusResult = await status({ projectDir: tmpDir });
    expect(statusResult.fileCount).toBeGreaterThanOrEqual(1);
    expect(statusResult.chunkCount).toBeGreaterThan(0);
  }, 120_000);

  test('incremental indexing: add file, re-index → fileCount increases', async () => {
    writeFile(tmpDir, 'a.ts', 'export const a = 1;');
    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;

    const { status } = await import('../../src/index.js');
    const status1 = await status({ projectDir: tmpDir });

    writeFile(tmpDir, 'b.ts', 'export const b = 2;');
    await tryIndex(tmpDir, { type: 'code' });
    const status2 = await status({ projectDir: tmpDir });

    expect(status2.fileCount).toBeGreaterThan(status1.fileCount);
  }, 120_000);

  test('clear: true resets index (chunksReused === 0)', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;

    const cleared = await tryIndex(tmpDir, { type: 'code', clear: true });
    if (cleared === null) return;

    expect(cleared.chunksReused).toBe(0);
    expect(cleared.chunksCreated).toBeGreaterThan(0);
  }, 120_000);

  test('query after file modification returns updated content', async () => {
    writeFile(tmpDir, 'data.ts', 'export const value = "alpha";');
    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;

    // Modify the file
    writeFile(tmpDir, 'data.ts', 'export const value = "beta_unique_string";');
    await tryIndex(tmpDir, { type: 'code' });

    const result = await tryQuery('beta_unique_string', { projectDir: tmpDir, type: 'code' });
    if (result === null) return;

    if (result.code.length > 0) {
      expect(result.code[0].text).toContain('beta_unique_string');
    }
  }, 120_000);

  test('status detects staleness after adding file without re-indexing', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    // Add a new file without re-indexing
    writeFile(tmpDir, 'new-file.ts', 'export const y = 2;');

    const { status } = await import('../../src/index.js');
    const result = await status({ projectDir: tmpDir });

    expect(result.staleFileCount).toBeGreaterThanOrEqual(1);
  }, 120_000);

  test('multi-type project: code + text files → byType has both', async () => {
    writeFile(tmpDir, 'code.ts', 'export const x = 1;');
    writeFile(tmpDir, 'readme.md', '# Hello World\nSome documentation text.');

    const indexResult = await tryIndex(tmpDir);
    if (indexResult === null) return;

    const { status } = await import('../../src/index.js');
    const result = await status({ projectDir: tmpDir });

    expect(result.byType.code.files).toBeGreaterThanOrEqual(1);
    expect(result.byType.text.files).toBeGreaterThanOrEqual(1);
  }, 120_000);

  test('query auto-indexes then returns results (indexing field present)', async () => {
    writeFile(tmpDir, 'hello.ts', 'export function greet() { return "hello world"; }');

    const result = await tryQuery('greet', { projectDir: tmpDir });
    if (result === null) return;

    expect(result.indexing).toBeDefined();
    expect(result.indexing!.status).toBe('ok');
    expect(result.indexing!.filesIndexed).toBeGreaterThanOrEqual(1);
  }, 120_000);

  test('multi-type query: code + text results correct with shared pipeline', async () => {
    writeFile(tmpDir, 'utils.ts', 'export function parseConfig(raw: string) { return JSON.parse(raw); }');
    writeFile(tmpDir, 'guide.md', '# Configuration Guide\nUse parseConfig to load your settings from a JSON file.');

    const indexResult = await tryIndex(tmpDir);
    if (indexResult === null) return;

    const result = await tryQuery('parse configuration', { projectDir: tmpDir });
    if (result === null) return;

    // Both code and text results should be present and correct
    expect(result.code.length + result.text.length).toBeGreaterThan(0);
    if (result.code.length > 0) {
      expect(result.code[0].text).toContain('parseConfig');
    }
    if (result.text.length > 0) {
      expect(result.text[0].text).toContain('Configuration');
    }
  }, 120_000);

  test('re-index unchanged content → chunksReused > 0, filesSkipped > 0', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;

    const second = await tryIndex(tmpDir, { type: 'code' });
    if (second === null) return;

    expect(second.chunksReused).toBeGreaterThan(0);
    expect(second.filesSkipped).toBeGreaterThan(0);
    expect(second.filesIndexed).toBe(0);
  }, 120_000);
});
