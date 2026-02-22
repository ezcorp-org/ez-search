import { describe, test, expect } from 'bun:test';
import { EXTENSION_MAP, BUILTIN_EXCLUSIONS } from '../../src/types';

describe('EXTENSION_MAP', () => {
  test('maps known extensions to correct FileType', () => {
    expect(EXTENSION_MAP['.ts']).toBe('code');
    expect(EXTENSION_MAP['.md']).toBe('text');
    expect(EXTENSION_MAP['.jpg']).toBe('image');
    expect(EXTENSION_MAP['.pdf']).toBe('text');
    expect(EXTENSION_MAP['.json']).toBe('code');
  });

  test('returns undefined for unknown extensions', () => {
    expect(EXTENSION_MAP['.xyz']).toBeUndefined();
    expect(EXTENSION_MAP['.mp4']).toBeUndefined();
  });

  test('covers all three FileType categories', () => {
    const values = new Set(Object.values(EXTENSION_MAP));
    expect(values.has('code')).toBe(true);
    expect(values.has('text')).toBe(true);
    expect(values.has('image')).toBe(true);
  });
});

describe('BUILTIN_EXCLUSIONS', () => {
  test('includes node_modules, .git, and .ez-search', () => {
    expect(BUILTIN_EXCLUSIONS).toContain('node_modules');
    expect(BUILTIN_EXCLUSIONS).toContain('.git');
    expect(BUILTIN_EXCLUSIONS).toContain('.ez-search');
  });

  test('does not include source directories', () => {
    expect(BUILTIN_EXCLUSIONS).not.toContain('src');
    expect(BUILTIN_EXCLUSIONS).not.toContain('lib');
  });
});
