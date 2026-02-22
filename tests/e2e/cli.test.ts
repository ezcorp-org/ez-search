import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir } from '../helpers/fixtures.js';

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

describe('CLI', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('ez-search status in empty temp dir exits non-zero with JSON error', async () => {
    const { stdout, exitCode } = await runCLI(['status'], tmpDir);

    expect(exitCode).not.toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe(true);
  });

  test('ez-search status --format text in empty temp dir exits non-zero with stderr error', async () => {
    const { stderr, exitCode } = await runCLI(['status', '--format', 'text'], tmpDir);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Error:');
  });

  test('ez-search query "test" --type image in empty temp dir outputs JSON error', async () => {
    const { stdout, exitCode } = await runCLI(['query', 'test', '--type', 'image'], tmpDir);

    expect(exitCode).not.toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe(true);
  });

  test('ez-search --version outputs version and exits 0', async () => {
    const { stdout, exitCode } = await runCLI(['--version'], PROJECT_ROOT);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });

  test('ez-search --help outputs help text and exits 0', async () => {
    const { stdout, exitCode } = await runCLI(['--help'], PROJECT_ROOT);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('ez-search');
  });

  test('ez-search query --no-auto-index fails with NO_INDEX on unindexed dir', async () => {
    const filePath = path.join(tmpDir, 'hello.ts');
    fs.writeFileSync(filePath, 'export function greet() { return "hello"; }');

    const { stdout, exitCode } = await runCLI(['query', 'greet', '--no-auto-index'], tmpDir);

    expect(exitCode).not.toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe('NO_INDEX');
  });

  test('ez-search query includes stale info when index is outdated', async () => {
    const filePath = path.join(tmpDir, 'hello.ts');
    fs.writeFileSync(filePath, 'export function greet() { return "hello"; }');

    // Index first
    const indexResult = await runCLI(['index', '.'], tmpDir);

    if (indexResult.exitCode !== 0) {
      // Vector DB / model not available on this platform — skip gracefully
      return;
    }

    // Add a new file to make index stale
    fs.writeFileSync(path.join(tmpDir, 'world.ts'), 'export function world() { return "world"; }');

    // Query with --no-auto-index to prevent re-indexing
    const { stdout, exitCode } = await runCLI(['query', 'greet', '--no-auto-index'], tmpDir);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.stale).toBe(true);
    expect(parsed.staleFileCount).toBeGreaterThanOrEqual(1);
  }, 120_000);

  test('ez-search query auto-indexes when no index exists', async () => {
    const filePath = path.join(tmpDir, 'hello.ts');
    fs.writeFileSync(filePath, 'export function greet() { return "hello"; }');

    // Query without indexing first — should auto-index
    const { stdout, exitCode } = await runCLI(['query', 'greet function'], tmpDir);
    const parsed = JSON.parse(stdout);

    if (exitCode === 0) {
      // Full pipeline available: verify indexing stats in output
      expect(parsed.indexing).toBeDefined();
      expect(parsed.indexing.status).toBe('ok');
      expect(parsed.indexing.filesIndexed).toBeGreaterThanOrEqual(1);
      expect(parsed.query).toBe('greet function');
    } else {
      // Vector DB or model not available on this platform —
      // verify the error is NOT NO_INDEX (auto-index was attempted)
      expect(parsed.error).toBe(true);
      expect(parsed.code).not.toBe('NO_INDEX');
    }
  }, 120_000);
});
