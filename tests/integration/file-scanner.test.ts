import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import { scanFiles } from '../../src/services/file-scanner.js';
import type { ScannedFile, ScanOptions } from '../../src/types.js';
import { createTempDir, cleanupTempDir, writeFile } from '../helpers/fixtures.js';

async function collect(gen: AsyncGenerator<ScannedFile>): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  for await (const item of gen) results.push(item);
  return results;
}

describe('scanFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  test('yields files with recognized extensions (.ts, .md, .json)', async () => {
    writeFile(tmpDir, 'index.ts', 'export const a = 1;');
    writeFile(tmpDir, 'readme.md', '# Hello');
    writeFile(tmpDir, 'config.json', '{}');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: false }));
    const relPaths = results.map((r) => r.relativePath).sort();

    expect(relPaths).toEqual(['config.json', 'index.ts', 'readme.md']);
  });

  test('skips files with unknown extensions (.xyz, .mp4)', async () => {
    writeFile(tmpDir, 'data.xyz', 'unknown');
    writeFile(tmpDir, 'video.mp4', 'binary');
    writeFile(tmpDir, 'keep.ts', 'code');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: false }));

    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe('keep.ts');
  });

  test('returns correct absolutePath, relativePath, type, sizeBytes, mtimeMs', async () => {
    const content = 'const x = 42;';
    writeFile(tmpDir, 'src/app.ts', content);

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: false }));

    expect(results).toHaveLength(1);
    const file = results[0];
    expect(file.absolutePath).toBe(path.join(tmpDir, 'src/app.ts'));
    expect(file.relativePath).toBe(path.join('src', 'app.ts'));
    expect(file.type).toBe('code');
    expect(file.sizeBytes).toBe(Buffer.byteLength(content));
    expect(typeof file.mtimeMs).toBe('number');
    expect(file.mtimeMs).toBeGreaterThan(0);
  });

  test('recurses into subdirectories', async () => {
    writeFile(tmpDir, 'a/b/c/deep.ts', 'deep');
    writeFile(tmpDir, 'top.ts', 'top');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: false }));
    const relPaths = results.map((r) => r.relativePath).sort();

    expect(relPaths).toContain(path.join('a', 'b', 'c', 'deep.ts'));
    expect(relPaths).toContain('top.ts');
    expect(results).toHaveLength(2);
  });

  test('excludes node_modules, .git, dist, .ez-search directories', async () => {
    writeFile(tmpDir, 'node_modules/pkg/index.js', 'module');
    writeFile(tmpDir, '.git/config', 'git');
    writeFile(tmpDir, 'dist/bundle.js', 'bundle');
    writeFile(tmpDir, '.ez-search/data.json', 'data');
    writeFile(tmpDir, 'src/main.ts', 'main');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: false }));

    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe(path.join('src', 'main.ts'));
  });

  test('excludes *.lock, *.min.js, *.map files', async () => {
    writeFile(tmpDir, 'yarn.lock', 'lock');
    writeFile(tmpDir, 'bundle.min.js', 'minified');
    writeFile(tmpDir, 'bundle.js.map', 'sourcemap');
    writeFile(tmpDir, 'real.ts', 'real');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: false }));

    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe('real.ts');
  });

  test('respects .gitignore patterns when useIgnoreFiles=true', async () => {
    writeFile(tmpDir, '.gitignore', 'ignored-dir/\n');
    writeFile(tmpDir, 'ignored-dir/secret.ts', 'secret');
    writeFile(tmpDir, 'visible.ts', 'visible');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: true }));
    const relPaths = results.map((r) => r.relativePath);

    expect(relPaths).not.toContain(path.join('ignored-dir', 'secret.ts'));
    expect(relPaths).toContain('visible.ts');
  });

  test('ignores .gitignore when useIgnoreFiles=false', async () => {
    writeFile(tmpDir, '.gitignore', 'ignored-dir/\n');
    writeFile(tmpDir, 'ignored-dir/secret.ts', 'secret');
    writeFile(tmpDir, 'visible.ts', 'visible');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: false }));
    const relPaths = results.map((r) => r.relativePath);

    expect(relPaths).toContain(path.join('ignored-dir', 'secret.ts'));
    expect(relPaths).toContain('visible.ts');
  });

  test('respects .cursorignore patterns', async () => {
    writeFile(tmpDir, '.cursorignore', 'private/\n');
    writeFile(tmpDir, 'private/keys.ts', 'keys');
    writeFile(tmpDir, 'public.ts', 'public');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: true }));
    const relPaths = results.map((r) => r.relativePath);

    expect(relPaths).not.toContain(path.join('private', 'keys.ts'));
    expect(relPaths).toContain('public.ts');
  });

  test('applies .gitignore and .cursorignore simultaneously', async () => {
    writeFile(tmpDir, '.gitignore', 'logs/\n');
    writeFile(tmpDir, '.cursorignore', 'private/\n');
    writeFile(tmpDir, 'logs/run.ts', 'log');
    writeFile(tmpDir, 'private/keys.ts', 'keys');
    writeFile(tmpDir, 'src/main.ts', 'main');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: true }));
    const relPaths = results.map((r) => r.relativePath);

    expect(relPaths).not.toContain(path.join('logs', 'run.ts'));
    expect(relPaths).not.toContain(path.join('private', 'keys.ts'));
    expect(relPaths).toContain(path.join('src', 'main.ts'));
  });

  test('does NOT honor nested .gitignore in subdirectories (only root is read)', async () => {
    // Only root .gitignore is loaded — a nested .gitignore should have no effect.
    writeFile(tmpDir, 'sub/.gitignore', 'secret.ts\n');
    writeFile(tmpDir, 'sub/secret.ts', 'should still be indexed');
    writeFile(tmpDir, 'sub/visible.ts', 'visible');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: true }));
    const relPaths = results.map((r) => r.relativePath);

    expect(relPaths).toContain(path.join('sub', 'secret.ts'));
    expect(relPaths).toContain(path.join('sub', 'visible.ts'));
  });

  test('does NOT read .npmignore, .ignore, or .dockerignore', async () => {
    // Only .gitignore and .cursorignore are loaded.
    writeFile(tmpDir, '.npmignore', 'npm-only.ts\n');
    writeFile(tmpDir, '.ignore', 'rg-only.ts\n');
    writeFile(tmpDir, '.dockerignore', 'docker-only.ts\n');
    writeFile(tmpDir, 'npm-only.ts', 'a');
    writeFile(tmpDir, 'rg-only.ts', 'b');
    writeFile(tmpDir, 'docker-only.ts', 'c');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: true }));
    const relPaths = results.map((r) => r.relativePath);

    expect(relPaths).toContain('npm-only.ts');
    expect(relPaths).toContain('rg-only.ts');
    expect(relPaths).toContain('docker-only.ts');
  });

  test('honors .gitignore negation (!) to re-include patterns', async () => {
    writeFile(tmpDir, '.gitignore', '*.log.ts\n!keep.log.ts\n');
    writeFile(tmpDir, 'drop.log.ts', 'drop');
    writeFile(tmpDir, 'keep.log.ts', 'keep');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: true }));
    const relPaths = results.map((r) => r.relativePath);

    expect(relPaths).not.toContain('drop.log.ts');
    expect(relPaths).toContain('keep.log.ts');
  });

  test('honors .gitignore wildcard patterns and ** globs', async () => {
    writeFile(tmpDir, '.gitignore', '*.tmp.ts\n**/generated/**\n');
    writeFile(tmpDir, 'a.tmp.ts', 'tmp');
    writeFile(tmpDir, 'src/b.tmp.ts', 'tmp nested');
    writeFile(tmpDir, 'src/generated/code.ts', 'gen');
    writeFile(tmpDir, 'deep/nested/generated/x.ts', 'deep gen');
    writeFile(tmpDir, 'src/keep.ts', 'real');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: true }));
    const relPaths = results.map((r) => r.relativePath);

    expect(relPaths).not.toContain('a.tmp.ts');
    expect(relPaths).not.toContain(path.join('src', 'b.tmp.ts'));
    expect(relPaths).not.toContain(path.join('src', 'generated', 'code.ts'));
    expect(relPaths).not.toContain(path.join('deep', 'nested', 'generated', 'x.ts'));
    expect(relPaths).toContain(path.join('src', 'keep.ts'));
  });

  test('tolerates comments and blank lines in .gitignore', async () => {
    writeFile(
      tmpDir,
      '.gitignore',
      '# this is a comment\n\n   \nignored.ts\n# trailing comment\n',
    );
    writeFile(tmpDir, 'ignored.ts', 'no');
    writeFile(tmpDir, 'kept.ts', 'yes');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: true }));
    const relPaths = results.map((r) => r.relativePath);

    expect(relPaths).not.toContain('ignored.ts');
    expect(relPaths).toContain('kept.ts');
  });

  test('built-in exclusions stay active even when useIgnoreFiles=false', async () => {
    // useIgnoreFiles=false disables .gitignore/.cursorignore but NOT BUILTIN_EXCLUSIONS.
    writeFile(tmpDir, 'node_modules/pkg/index.ts', 'mod');
    writeFile(tmpDir, 'dist/out.ts', 'dist');
    writeFile(tmpDir, 'pnpm-lock.yaml', 'lock');
    writeFile(tmpDir, 'src/main.ts', 'main');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: false }));
    const relPaths = results.map((r) => r.relativePath);

    expect(relPaths).not.toContain(path.join('node_modules', 'pkg', 'index.ts'));
    expect(relPaths).not.toContain(path.join('dist', 'out.ts'));
    expect(relPaths).not.toContain('pnpm-lock.yaml');
    expect(relPaths).toContain(path.join('src', 'main.ts'));
  });

  test('an empty .gitignore is a no-op', async () => {
    writeFile(tmpDir, '.gitignore', '');
    writeFile(tmpDir, 'a.ts', 'a');
    writeFile(tmpDir, 'b.ts', 'b');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: true }));
    const relPaths = results.map((r) => r.relativePath).sort();

    expect(relPaths).toEqual(['a.ts', 'b.ts']);
  });

  test('type filter: yields only code files when typeFilter=code', async () => {
    writeFile(tmpDir, 'app.ts', 'code');
    writeFile(tmpDir, 'config.json', '{}');
    writeFile(tmpDir, 'readme.md', 'text');
    writeFile(tmpDir, 'photo.jpg', 'image');

    const results = await collect(
      scanFiles(tmpDir, { useIgnoreFiles: false, typeFilter: 'code' }),
    );

    expect(results.every((r) => r.type === 'code')).toBe(true);
    const relPaths = results.map((r) => r.relativePath).sort();
    expect(relPaths).toEqual(['app.ts', 'config.json']);
  });

  test('type filter: yields only text files when typeFilter=text', async () => {
    writeFile(tmpDir, 'app.ts', 'code');
    writeFile(tmpDir, 'readme.md', 'text');
    writeFile(tmpDir, 'notes.txt', 'notes');

    const results = await collect(
      scanFiles(tmpDir, { useIgnoreFiles: false, typeFilter: 'text' }),
    );

    expect(results.every((r) => r.type === 'text')).toBe(true);
    const relPaths = results.map((r) => r.relativePath).sort();
    expect(relPaths).toEqual(['notes.txt', 'readme.md']);
  });

  test('yields nothing for empty directory', async () => {
    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: false }));
    expect(results).toHaveLength(0);
  });

  test('handles files with multiple extensions (.test.ts -> code)', async () => {
    writeFile(tmpDir, 'app.test.ts', 'test code');
    writeFile(tmpDir, 'utils.spec.js', 'spec code');

    const results = await collect(scanFiles(tmpDir, { useIgnoreFiles: false }));

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.type === 'code')).toBe(true);
  });
});
