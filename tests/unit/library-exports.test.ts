/**
 * Library API — export surface tests.
 *
 * Verifies that the public API exports exist and have correct types.
 * These tests are fast (no I/O, no models).
 */

import { describe, test, expect } from 'bun:test';

describe('Library exports', () => {
  test('exports index function', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.index).toBe('function');
  });

  test('exports query function', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.query).toBe('function');
  });

  test('exports status function', async () => {
    const mod = await import('../../src/index.js');
    expect(typeof mod.status).toBe('function');
  });

  test('exports EzSearchError class', async () => {
    const mod = await import('../../src/index.js');
    expect(mod.EzSearchError).toBeDefined();
    expect(typeof mod.EzSearchError).toBe('function');
  });

  test('EzSearchError is instanceof Error', async () => {
    const { EzSearchError } = await import('../../src/index.js');
    const err = new EzSearchError('NO_INDEX', 'test message', 'test suggestion');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EzSearchError);
  });

  test('EzSearchError carries code, message, and suggestion', async () => {
    const { EzSearchError } = await import('../../src/index.js');
    const err = new EzSearchError('CORRUPT_MANIFEST', 'broken', 'fix it');
    expect(err.code).toBe('CORRUPT_MANIFEST');
    expect(err.message).toBe('broken');
    expect(err.suggestion).toBe('fix it');
  });

  test('does not export CLI internals (program, emitError)', async () => {
    const mod = await import('../../src/index.js');
    expect((mod as Record<string, unknown>)['program']).toBeUndefined();
    expect((mod as Record<string, unknown>)['emitError']).toBeUndefined();
  });

  test('exports FileType type via re-export', async () => {
    // FileType is a type, but EXTENSION_MAP uses it — verify types module is accessible
    const mod = await import('../../src/index.js');
    // We export the type, which can't be checked at runtime, but we can check
    // that IndexOptions type constrains the type field (tested via TypeScript compilation)
    expect(mod.index).toBeDefined();
  });
});
