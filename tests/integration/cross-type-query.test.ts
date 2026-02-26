/**
 * Integration tests — cross-type query filtering.
 *
 * Verifies that querying with a type filter returns only results
 * of the requested type from a mixed-type index.
 * Gracefully skips when native dependencies are unavailable.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDir, cleanupTempDir, writeFile, tryIndex, tryQuery } from '../helpers/fixtures.js';

describe('Cross-type query filtering', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('type: code returns only code results from mixed index', async () => {
    writeFile(tmpDir, 'parser.ts', 'export function parseJSON(input: string) { return JSON.parse(input); }');
    writeFile(tmpDir, 'guide.md', '# Parsing Guide\nUse parseJSON to parse your input data.');

    const indexResult = await tryIndex(tmpDir);
    if (indexResult === null) return;

    const result = await tryQuery('parse input', { projectDir: tmpDir, type: 'code' });
    if (result === null) return;

    // Code results should be present
    expect(result.code.length).toBeGreaterThan(0);
    // Text results should be empty when type: 'code' is specified
    expect(result.text.length).toBe(0);
  }, 120_000);

  test('type: text returns only text results from mixed index', async () => {
    writeFile(tmpDir, 'parser.ts', 'export function parseJSON(input: string) { return JSON.parse(input); }');
    writeFile(tmpDir, 'guide.md', '# Parsing Guide\nUse parseJSON to parse your input data.');

    const indexResult = await tryIndex(tmpDir);
    if (indexResult === null) return;

    const result = await tryQuery('parse input', { projectDir: tmpDir, type: 'text' });
    if (result === null) return;

    // Text results should be present
    expect(result.text.length).toBeGreaterThan(0);
    // Code results should be empty when type: 'text' is specified
    expect(result.code.length).toBe(0);
  }, 120_000);

  test('no type filter returns both code and text results', async () => {
    writeFile(tmpDir, 'utils.ts', 'export function formatDate(d: Date) { return d.toISOString(); }');
    writeFile(tmpDir, 'docs.md', '# Date Formatting\nThe formatDate function converts dates to ISO strings.');

    const indexResult = await tryIndex(tmpDir);
    if (indexResult === null) return;

    const result = await tryQuery('format date', { projectDir: tmpDir });
    if (result === null) return;

    // At least one type should have results
    expect(result.code.length + result.text.length).toBeGreaterThan(0);
  }, 120_000);

  test('code results contain file paths ending in code extensions', async () => {
    writeFile(tmpDir, 'app.ts', 'export function main() { console.log("start"); }');
    writeFile(tmpDir, 'readme.md', '# App\nRun main to start the application.');

    const indexResult = await tryIndex(tmpDir);
    if (indexResult === null) return;

    const result = await tryQuery('main start', { projectDir: tmpDir, type: 'code' });
    if (result === null) return;

    for (const item of result.code) {
      expect(item.file).toMatch(/\.(ts|js|tsx|jsx|py|go|rs|java|c|cpp|rb|php|swift|kt)$/);
    }
  }, 120_000);

  test('text results contain file paths ending in text extensions', async () => {
    writeFile(tmpDir, 'app.ts', 'export function main() { console.log("start"); }');
    writeFile(tmpDir, 'readme.md', '# App Documentation\nRun the main function to start the application.');

    const indexResult = await tryIndex(tmpDir);
    if (indexResult === null) return;

    const result = await tryQuery('documentation application', { projectDir: tmpDir, type: 'text' });
    if (result === null) return;

    for (const item of result.text) {
      expect(item.file).toMatch(/\.(md|txt|rst|adoc|org|html|csv|json|yaml|yml|xml|toml)$/);
    }
  }, 120_000);
});
