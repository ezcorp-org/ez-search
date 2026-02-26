/**
 * Library API — functional tests.
 *
 * Tests the return shapes and behavior of the library functions.
 * Tests that require the vector DB (zvec) skip gracefully when unavailable.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDir, cleanupTempDir, writeFile, tryIndex } from '../helpers/fixtures.js';

describe('Library API', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  describe('index()', () => {
    test('accepts path string as first argument', async () => {
      const { index, EzSearchError } = await import('../../src/index.js');
      // Empty dir should throw — either EMPTY_DIR or GENERAL_ERROR (zvec missing)
      await expect(index(tmpDir)).rejects.toBeInstanceOf(EzSearchError);
    });

    test('accepts options as second argument', async () => {
      const { index, EzSearchError } = await import('../../src/index.js');
      await expect(index(tmpDir, { type: 'code' })).rejects.toBeInstanceOf(EzSearchError);
    });

    test('returns IndexResult with all required fields', async () => {
      writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
      const result = await tryIndex(tmpDir);
      if (result === null) return; // zvec unavailable — skip

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('filesScanned');
      expect(result).toHaveProperty('filesIndexed');
      expect(result).toHaveProperty('filesSkipped');
      expect(result).toHaveProperty('chunksCreated');
      expect(result).toHaveProperty('chunksReused');
      expect(result).toHaveProperty('chunksRemoved');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('storageDir');
      expect(typeof result.filesScanned).toBe('number');
      expect(typeof result.durationMs).toBe('number');
    }, 120_000);

    test('does not write to stdout', async () => {
      writeFile(tmpDir, 'hello.ts', 'export const x = 1;');

      const chunks: string[] = [];
      const originalWrite = process.stdout.write;
      process.stdout.write = ((...args: unknown[]) => {
        chunks.push(String(args[0]));
        return true;
      }) as typeof process.stdout.write;

      try {
        const result = await tryIndex(tmpDir);
        if (result === null) return; // zvec unavailable — skip
      } finally {
        process.stdout.write = originalWrite;
      }

      expect(chunks.length).toBe(0);
    }, 120_000);
  });

  describe('query()', () => {
    test('returns object with code, text, and image arrays', async () => {
      writeFile(tmpDir, 'hello.ts', 'export function greet() { return "hello world"; }');
      const indexResult = await tryIndex(tmpDir, { type: 'code' });
      if (indexResult === null) return;

      const { query } = await import('../../src/index.js');
      const result = await query('greet function', { projectDir: tmpDir });

      expect(result).toHaveProperty('query');
      expect(result.query).toBe('greet function');
      expect(Array.isArray(result.code)).toBe(true);
      expect(Array.isArray(result.text)).toBe(true);
      expect(Array.isArray(result.image)).toBe(true);
    }, 120_000);

    test('respects topK option', async () => {
      writeFile(tmpDir, 'a.ts', 'export const a = 1;');
      writeFile(tmpDir, 'b.ts', 'export const b = 2;');
      writeFile(tmpDir, 'c.ts', 'export const c = 3;');
      const indexResult = await tryIndex(tmpDir, { type: 'code' });
      if (indexResult === null) return;

      const { query } = await import('../../src/index.js');
      const result = await query('export const', { projectDir: tmpDir, topK: 1 });

      expect(result.code.length).toBeLessThanOrEqual(1);
    }, 120_000);

    test('respects type option', async () => {
      writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
      writeFile(tmpDir, 'readme.md', '# Hello world');
      const indexResult = await tryIndex(tmpDir);
      if (indexResult === null) return;

      const { query } = await import('../../src/index.js');
      const result = await query('hello', { projectDir: tmpDir, type: 'code' });

      expect(result.text).toEqual([]);
      expect(result.image).toEqual([]);
    }, 120_000);

    test('does not write to stdout', async () => {
      writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
      const indexResult = await tryIndex(tmpDir, { type: 'code' });
      if (indexResult === null) return;

      const { query } = await import('../../src/index.js');
      const chunks: string[] = [];
      const originalWrite = process.stdout.write;
      process.stdout.write = ((...args: unknown[]) => {
        chunks.push(String(args[0]));
        return true;
      }) as typeof process.stdout.write;

      try {
        await query('hello', { projectDir: tmpDir });
      } finally {
        process.stdout.write = originalWrite;
      }

      expect(chunks.length).toBe(0);
    }, 120_000);

    test('code results have file, lines, score, text fields', async () => {
      writeFile(tmpDir, 'hello.ts', 'export function greet() { return "hello world"; }');
      const indexResult = await tryIndex(tmpDir, { type: 'code' });
      if (indexResult === null) return;

      const { query } = await import('../../src/index.js');
      const result = await query('greet', { projectDir: tmpDir, type: 'code' });

      if (result.code.length > 0) {
        const first = result.code[0];
        expect(first).toHaveProperty('file');
        expect(first).toHaveProperty('lines');
        expect(first).toHaveProperty('score');
        expect(first).toHaveProperty('text');
        expect(typeof first.file).toBe('string');
        expect(typeof first.score).toBe('number');
      }
    }, 120_000);
  });

  describe('status()', () => {
    test('returns object with correct shape after indexing', async () => {
      writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
      const indexResult = await tryIndex(tmpDir, { type: 'code' });
      if (indexResult === null) return;

      const { status } = await import('../../src/index.js');
      const result = await status({ projectDir: tmpDir });

      expect(result).toHaveProperty('fileCount');
      expect(result).toHaveProperty('chunkCount');
      expect(result).toHaveProperty('lastIndexed');
      expect(result).toHaveProperty('indexSizeBytes');
      expect(result).toHaveProperty('storagePath');
      expect(result).toHaveProperty('staleFileCount');
      expect(result).toHaveProperty('byType');
      expect(typeof result.fileCount).toBe('number');
      expect(typeof result.chunkCount).toBe('number');
      expect(result.fileCount).toBeGreaterThanOrEqual(1);
    }, 120_000);

    test('does not write to stdout', async () => {
      writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
      const indexResult = await tryIndex(tmpDir, { type: 'code' });
      if (indexResult === null) return;

      const { status } = await import('../../src/index.js');
      const chunks: string[] = [];
      const originalWrite = process.stdout.write;
      process.stdout.write = ((...args: unknown[]) => {
        chunks.push(String(args[0]));
        return true;
      }) as typeof process.stdout.write;

      try {
        await status({ projectDir: tmpDir });
      } finally {
        process.stdout.write = originalWrite;
      }

      expect(chunks.length).toBe(0);
    }, 120_000);
  });
});
