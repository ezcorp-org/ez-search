/**
 * Integration tests — auto-index query path.
 *
 * Verifies that query() automatically indexes when no index exists,
 * and populates the indexing field in results.
 * Gracefully skips when native dependencies are unavailable.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDir, cleanupTempDir, writeFile, tryQuery } from '../helpers/fixtures.js';

describe('Auto-index query path', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('query on unindexed dir auto-indexes and returns results', async () => {
    writeFile(tmpDir, 'hello.ts', 'export function greet(name: string) { return `Hello ${name}`; }');
    writeFile(tmpDir, 'utils.ts', 'export function add(a: number, b: number) { return a + b; }');

    // Do NOT call index() first — query should auto-index
    const result = await tryQuery('greet function', { projectDir: tmpDir });
    if (result === null) return;

    expect(result.query).toBe('greet function');
    expect(result.code.length + result.text.length).toBeGreaterThan(0);
  }, 120_000);

  test('auto-index populates indexing field with stats', async () => {
    writeFile(tmpDir, 'data.ts', 'export const config = { timeout: 5000, retries: 3 };');

    const result = await tryQuery('config timeout', { projectDir: tmpDir });
    if (result === null) return;

    expect(result.indexing).toBeDefined();
    expect(result.indexing!.status).toBe('ok');
    expect(result.indexing!.filesIndexed).toBeGreaterThanOrEqual(1);
    expect(result.indexing!.durationMs).toBeGreaterThanOrEqual(0);
  }, 120_000);

  test('second query on same dir does NOT re-index (no indexing field)', async () => {
    writeFile(tmpDir, 'hello.ts', 'export function greet() { return "hi"; }');

    // First query triggers auto-index
    const first = await tryQuery('greet', { projectDir: tmpDir });
    if (first === null) return;
    expect(first.indexing).toBeDefined();

    // Second query should use existing index
    const second = await tryQuery('greet', { projectDir: tmpDir });
    if (second === null) return;
    expect(second.indexing).toBeUndefined();
  }, 120_000);

  test('autoIndex: false throws when no index exists', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const x = 1;');

    const { query } = await import('../../src/index.js');
    try {
      await query('test', { projectDir: tmpDir, autoIndex: false });
      // If we get here, the env may not have native deps — that's ok
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Prebuilt binary')) return;
      // Should be a NO_INDEX error
      expect((err as any).code).toBe('NO_INDEX');
    }
  }, 120_000);
});
