import { describe, test, expect } from 'bun:test';
import * as os from 'os';
import * as path from 'path';
import { resolveProjectStoragePath, resolveModelCachePath } from '../../src/config/paths.js';

describe('resolveProjectStoragePath', () => {
  test('returns .ez-search directory under the project directory', () => {
    const result = resolveProjectStoragePath('/tmp/my-project');
    expect(result).toBe(path.resolve('/tmp/my-project', '.ez-search'));
  });

  test('is deterministic for the same input', () => {
    const a = resolveProjectStoragePath('/tmp/my-project');
    const b = resolveProjectStoragePath('/tmp/my-project');
    expect(a).toBe(b);
  });

  test('produces different paths for different directories', () => {
    const a = resolveProjectStoragePath('/tmp/project-a');
    const b = resolveProjectStoragePath('/tmp/project-b');
    expect(a).not.toBe(b);
  });

  test('resolves relative paths', () => {
    const result = resolveProjectStoragePath('./my-project');
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.endsWith('.ez-search')).toBe(true);
  });
});

describe('resolveModelCachePath', () => {
  test('returns path ending with .ez-search/models', () => {
    const result = resolveModelCachePath();
    expect(result).toBe(os.homedir() + '/.ez-search/models');
  });
});
