/**
 * E2E tests — hybrid search CLI flag validation.
 *
 * Tests --mode flag acceptance and error handling at the CLI level.
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

describe('Hybrid CLI', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('--mode hybrid flag accepted', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
    // Index first
    const indexResult = await runCLI(['index', '.'], tmpDir);
    if (indexResult.exitCode !== 0 && (indexResult.stdout.includes('Prebuilt binary') || indexResult.stderr.includes('Prebuilt binary'))) return;

    const { stdout, exitCode } = await runCLI(['query', 'test', '--mode', 'hybrid'], tmpDir);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.mode).toBe('hybrid');
  }, 120_000);

  test('--mode semantic flag accepted', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
    const indexResult = await runCLI(['index', '.'], tmpDir);
    if (indexResult.exitCode !== 0 && (indexResult.stdout.includes('Prebuilt binary') || indexResult.stderr.includes('Prebuilt binary'))) return;

    const { stdout, exitCode } = await runCLI(['query', 'test', '--mode', 'semantic'], tmpDir);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.mode).toBe('semantic');
  }, 120_000);

  test('--mode keyword flag accepted', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
    const indexResult = await runCLI(['index', '.'], tmpDir);
    if (indexResult.exitCode !== 0 && (indexResult.stdout.includes('Prebuilt binary') || indexResult.stderr.includes('Prebuilt binary'))) return;

    const { stdout, exitCode } = await runCLI(['query', 'test', '--mode', 'keyword'], tmpDir);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.mode).toBe('keyword');
  }, 120_000);

  test('invalid --mode value rejected with non-zero exit and error JSON', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
    const indexResult = await runCLI(['index', '.'], tmpDir);
    if (indexResult.exitCode !== 0 && indexResult.stderr.includes('Prebuilt binary')) return;

    const { stdout, exitCode } = await runCLI(['query', 'test', '--mode', 'invalid'], tmpDir);
    expect(exitCode).not.toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe('INVALID_MODE');
  }, 120_000);

  test('--mode keyword with --no-auto-index on unindexed project → NO_INDEX error', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const x = 1;');

    const { stdout, exitCode } = await runCLI(['query', 'test', '--mode', 'keyword', '--no-auto-index'], tmpDir);
    expect(exitCode).not.toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe('NO_INDEX');
  }, 120_000);

  test('JSON output shape includes mode field', async () => {
    writeFile(tmpDir, 'hello.ts', 'export const x = 1;');
    const indexResult = await runCLI(['index', '.'], tmpDir);
    if (indexResult.exitCode !== 0 && (indexResult.stdout.includes('Prebuilt binary') || indexResult.stderr.includes('Prebuilt binary'))) return;

    const { stdout, exitCode } = await runCLI(['query', 'test', '--mode', 'keyword'], tmpDir);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('query');
    expect(parsed).toHaveProperty('totalIndexed');
    expect(parsed).toHaveProperty('searchScope');
    expect(parsed).toHaveProperty('mode');
  }, 120_000);
});
