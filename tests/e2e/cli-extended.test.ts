/**
 * Extended E2E tests — CLI gaps coverage.
 *
 * Covers: --no-auto-index error shape, --dir scoping, --threshold filtering,
 * exit codes, and JSON vs text format output.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir, writeFile } from '../helpers/fixtures.js';

const PROJECT_ROOT = '/home/dev/work/ez-search';
const CLI_ENTRY = `${PROJECT_ROOT}/src/cli/index.ts`;

async function runCLI(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', 'run', CLI_ENTRY, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

/** Skip-guard: returns true if indexing fails due to missing native deps. */
function isEnvUnavailable(result: { stdout: string; stderr: string; exitCode: number }): boolean {
  const combined = result.stdout + result.stderr;
  return result.exitCode !== 0 && (
    combined.includes('Prebuilt binary') ||
    combined.includes('tokenizer.encode is not a function')
  );
}

describe('CLI Extended', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // --- 1. --no-auto-index error with --format json ---

  test('--no-auto-index with --format json outputs structured NO_INDEX error', async () => {
    writeFile(tmpDir, 'sample.ts', 'export const foo = 42;');

    const { stdout, exitCode } = await runCLI(
      ['query', 'test', '--no-auto-index', '--format', 'json'],
      tmpDir,
    );

    expect(exitCode).not.toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe('NO_INDEX');
    expect(parsed).toHaveProperty('message');
    expect(parsed).toHaveProperty('suggestion');
  });

  // --- 2. --dir scoping ---

  test('--dir scopes query results to subdirectory', async () => {
    writeFile(tmpDir, 'root-file.ts', 'export function rootFunction() { return "root"; }');
    writeFile(tmpDir, 'subdir/nested.ts', 'export function nestedFunction() { return "nested"; }');
    writeFile(tmpDir, 'other/other.ts', 'export function otherFunction() { return "other"; }');

    const indexResult = await runCLI(['index', '.'], tmpDir);
    if (isEnvUnavailable(indexResult)) return;
    expect(indexResult.exitCode).toBe(0);

    const { stdout, exitCode } = await runCLI(
      ['query', 'function', '--dir', 'subdir', '--no-auto-index'],
      tmpDir,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.searchScope).toBe('subdir');

    // All results should be within the subdir
    if (parsed.results && parsed.results.length > 0) {
      for (const result of parsed.results) {
        expect(result.file).toContain('subdir');
      }
    }
  }, 120_000);

  // --- 3. --threshold filtering ---

  test('--threshold 0.99 returns fewer or no results', async () => {
    writeFile(tmpDir, 'hello.ts', 'export function greet() { return "hello world"; }');
    writeFile(tmpDir, 'utils.ts', 'export function add(a: number, b: number) { return a + b; }');

    const indexResult = await runCLI(['index', '.'], tmpDir);
    if (isEnvUnavailable(indexResult)) return;
    expect(indexResult.exitCode).toBe(0);

    // Query without threshold — baseline
    const baseline = await runCLI(
      ['query', 'greeting function', '--no-auto-index'],
      tmpDir,
    );
    expect(baseline.exitCode).toBe(0);
    const baselineParsed = JSON.parse(baseline.stdout);

    // Query with very high threshold
    const filtered = await runCLI(
      ['query', 'greeting function', '--threshold', '0.99', '--no-auto-index'],
      tmpDir,
    );
    expect(filtered.exitCode).toBe(0);
    const filteredParsed = JSON.parse(filtered.stdout);

    // High threshold should return equal or fewer results
    const baselineCount = baselineParsed.results?.length ?? 0;
    const filteredCount = filteredParsed.results?.length ?? 0;
    expect(filteredCount).toBeLessThanOrEqual(baselineCount);
  }, 120_000);

  // --- 4. Exit codes ---

  test('status on unindexed dir exits with code 2', async () => {
    writeFile(tmpDir, 'dummy.ts', 'export const x = 1;');

    const { stdout, exitCode } = await runCLI(
      ['status', '--format', 'json'],
      tmpDir,
    );

    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe('NO_INDEX');
  });

  test('query --no-auto-index on unindexed dir exits with code 1', async () => {
    writeFile(tmpDir, 'dummy.ts', 'export const x = 1;');

    const { exitCode } = await runCLI(
      ['query', 'test', '--no-auto-index'],
      tmpDir,
    );

    expect(exitCode).toBe(1);
  });

  // --- 5. JSON vs text format ---

  test('status --format json returns valid JSON on indexed dir', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const greeting = "hi";');

    const indexResult = await runCLI(['index', '.'], tmpDir);
    if (isEnvUnavailable(indexResult)) return;
    expect(indexResult.exitCode).toBe(0);

    const { stdout, exitCode } = await runCLI(
      ['status', '--format', 'json'],
      tmpDir,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('indexed');
    expect(typeof parsed.indexed).toBe('number');
  }, 120_000);

  test('status --format text returns human-readable output on indexed dir', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const greeting = "hi";');

    const indexResult = await runCLI(['index', '.'], tmpDir);
    if (isEnvUnavailable(indexResult)) return;
    expect(indexResult.exitCode).toBe(0);

    const { stdout, exitCode } = await runCLI(
      ['status', '--format', 'text'],
      tmpDir,
    );

    expect(exitCode).toBe(0);
    // Text output should NOT be valid JSON
    expect(() => JSON.parse(stdout)).toThrow();
    // Should contain human-readable content
    expect(stdout.length).toBeGreaterThan(0);
  }, 120_000);

  test('status --format text on unindexed dir outputs error to stderr', async () => {
    writeFile(tmpDir, 'dummy.ts', 'export const x = 1;');

    const { stderr, exitCode } = await runCLI(
      ['status', '--format', 'text'],
      tmpDir,
    );

    expect(exitCode).toBe(2);
    expect(stderr).toContain('Error:');
  });
});
