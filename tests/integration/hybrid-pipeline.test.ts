/**
 * Integration tests — hybrid search pipeline (lexical index + fusion).
 *
 * Tests index → query with mode branching using real embeddings.
 * Gracefully skips when zvec/tokenizer is unavailable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDir, cleanupTempDir, writeFile, tryIndex, tryQuery } from '../helpers/fixtures.js';

describe('Hybrid pipeline integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('index creates lexical-index.json on disk', async () => {
    writeFile(tmpDir, 'hello.ts', 'export function greet() { return "hello world"; }');

    const result = await tryIndex(tmpDir, { type: 'code' });
    if (result === null) return;

    const lexicalPath = path.join(tmpDir, '.ez-search', 'lexical-index.json');
    expect(fs.existsSync(lexicalPath)).toBe(true);

    const content = fs.readFileSync(lexicalPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
  }, 120_000);

  test('keyword mode finds exact identifier', async () => {
    writeFile(tmpDir, 'config.ts', 'export const REDIS_CONNECTION_TIMEOUT = 5000;\nexport const MAX_RETRIES = 3;');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    const result = await tryQuery('REDIS_CONNECTION_TIMEOUT', { projectDir: tmpDir, mode: 'keyword', type: 'code' });
    if (result === null) return;

    expect(result.mode).toBe('keyword');
    expect(result.code.length).toBeGreaterThan(0);
    expect(result.code[0].file).toContain('config.ts');
  }, 120_000);

  test('hybrid mode returns results combining both signals', async () => {
    writeFile(tmpDir, 'auth.ts', 'export function handleUserAuth() { return true; }');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    const result = await tryQuery('handleUserAuth', { projectDir: tmpDir, mode: 'hybrid', type: 'code' });
    if (result === null) return;

    expect(result.mode).toBe('hybrid');
    expect(result.code.length).toBeGreaterThan(0);
  }, 120_000);

  test('semantic mode behaves unchanged', async () => {
    writeFile(tmpDir, 'hello.ts', 'export function greet() { return "hello world"; }');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    const result = await tryQuery('greeting function', { projectDir: tmpDir, mode: 'semantic', type: 'code' });
    if (result === null) return;

    expect(result.mode).toBe('semantic');
    expect(Array.isArray(result.code)).toBe(true);
  }, 120_000);

  test('incremental indexing: new file findable in keyword mode', async () => {
    writeFile(tmpDir, 'a.ts', 'export const FIRST_CONSTANT = 1;');
    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;

    writeFile(tmpDir, 'b.ts', 'export const SECOND_UNIQUE_CONSTANT = 2;');
    await tryIndex(tmpDir, { type: 'code' });

    const result = await tryQuery('SECOND_UNIQUE_CONSTANT', { projectDir: tmpDir, mode: 'keyword', type: 'code' });
    if (result === null) return;

    expect(result.code.length).toBeGreaterThan(0);
    expect(result.code[0].file).toContain('b.ts');
  }, 120_000);

  test('--clear wipes and rebuilds lexical index', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const OLD_TOKEN = 1;');
    const first = await tryIndex(tmpDir, { type: 'code' });
    if (first === null) return;

    writeFile(tmpDir, 'hello.ts', 'export const NEW_TOKEN = 2;');
    const cleared = await tryIndex(tmpDir, { type: 'code', clear: true });
    if (cleared === null) return;

    // OLD_TOKEN should no longer be findable
    const oldResult = await tryQuery('OLD_TOKEN', { projectDir: tmpDir, mode: 'keyword', type: 'code' });
    if (oldResult === null) return;
    expect(oldResult.code.length).toBe(0);

    // NEW_TOKEN should be findable
    const newResult = await tryQuery('NEW_TOKEN', { projectDir: tmpDir, mode: 'keyword', type: 'code' });
    if (newResult === null) return;
    expect(newResult.code.length).toBeGreaterThan(0);
  }, 120_000);

  test('dir filter works in keyword mode', async () => {
    writeFile(tmpDir, 'src/a.ts', 'export const SHARED_TOKEN = 1;');
    writeFile(tmpDir, 'lib/b.ts', 'export const SHARED_TOKEN = 2;');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    const result = await tryQuery('SHARED_TOKEN', { projectDir: tmpDir, mode: 'keyword', type: 'code', dir: 'src/' });
    if (result === null) return;

    for (const r of result.code) {
      expect(r.file).toMatch(/^src\//);
    }
  }, 120_000);

  test('default mode (no mode specified) works as hybrid', async () => {
    writeFile(tmpDir, 'hello.ts', 'export function greet() { return "hello world"; }');

    const indexResult = await tryIndex(tmpDir, { type: 'code' });
    if (indexResult === null) return;

    const result = await tryQuery('greet', { projectDir: tmpDir, type: 'code' });
    if (result === null) return;

    expect(result.mode).toBe('hybrid');
  }, 120_000);
});
